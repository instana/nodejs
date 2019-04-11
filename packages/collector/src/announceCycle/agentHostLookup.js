'use strict';

var atMostOnce = require('@instana/core').util.atMostOnce;
var exec = require('child_process').exec;
var http = require('@instana/core').uninstrumentedHttp.http;

var agentOpts = require('../agent/opts');

var logger;
logger = require('../logger').getLogger('announceCycle/agentHostLookup', function(newLogger) {
  logger = newLogger;
});

// Depending on the environment in which the agent and node collector are running,
// the agent may be available under different hosts. For instance,
// when the agent and collector are running on the same host outside any container,
// the host will probably be 127.0.0.1.
//
// A custom host can be set via agent options
//
// The host differs, when the collector is running inside a Docker container and the
// agent is running on the host.

var retryTimeoutMillis = 60 * 1000;

module.exports = {
  enter: enter,

  leave: function() {}
};

function enter(ctx) {
  var agentHost = agentOpts.host;

  checkHost(agentHost, function onCheckHost(localhostCheckErr) {
    if (!localhostCheckErr) {
      setAgentHost(agentHost);
      ctx.transitionTo('unannounced');
      return;
    }

    logger.debug('%s:%s is not running the agent. Trying default gateway...', agentHost, agentOpts.port, {
      error: localhostCheckErr
    });

    getDefaultGateway(function onGetDefaultGateway(getDefaultGatewayErr, defaultGateway) {
      if (getDefaultGatewayErr) {
        logger.debug('Error while trying to determine default gateway.', { error: getDefaultGatewayErr });
        logger.warn(
          'Agent cannot be contacted via %s and default gateway cannot be determined. ' +
            'Scheduling reattempt of agent host lookup in %s millis.',
          agentHost,
          retryTimeoutMillis
        );
        var defaultGatewayRetryTimeout = setTimeout(enter, retryTimeoutMillis, ctx);
        defaultGatewayRetryTimeout.unref();
        return;
      }

      checkHost(defaultGateway, function onCheckHostDefaultGateway(defaultGatewayCheckErr) {
        if (!defaultGatewayCheckErr) {
          setAgentHost(defaultGateway);
          ctx.transitionTo('unannounced');
          return;
        }

        logger.debug('Failed to contact agent via default gateway %s', defaultGateway, {
          error: defaultGatewayCheckErr
        });
        logger.warn(
          'Agent cannot be contacted via %s nor via default gateway %s. ' +
            'Scheduling reattempt of agent host lookup in %s millis.',
          agentHost,
          defaultGateway,
          retryTimeoutMillis
        );
        var checkHostRetryTimeout = setTimeout(enter, retryTimeoutMillis, ctx);
        checkHostRetryTimeout.unref();
      });
    });
  });
}

function getDefaultGateway(cb) {
  exec("/sbin/ip route | awk '/default/ { print $3 }'", function(error, stdout, stderr) {
    if (error !== null || stderr.length > 0) {
      cb(new Error('Failed to retrieve default gateway: ' + stderr));
    } else {
      cb(null, stdout.trim());
    }
  });
}

function checkHost(host, cb) {
  cb = atMostOnce('callback for checkHost: ' + host, cb);

  try {
    var req = http.request(
      {
        host: host,
        port: agentOpts.port,
        path: '/',
        agent: http.agent,
        method: 'GET'
      },
      function(res) {
        if (res.headers.server === agentOpts.serverHeader) {
          cb(null);
        } else {
          cb(new Error('Host ' + host + ' did not respond with expected agent header. Got: ' + res.headers.server));
        }
        res.resume();
      }
    );
  } catch (e) {
    cb(new Error('Host lookup failed due to: ' + e.message));
    return;
  }

  req.setTimeout(5000, function onTimeout() {
    cb(new Error('Host check timed out'));
  });

  req.on('error', function(err) {
    cb(new Error('Host check failed: ' + err.message));
  });

  req.end();
}

function setAgentHost(host) {
  logger.info('Attempting agent communication via %s:%s', host, agentOpts.port);
  agentOpts.host = host;
}
