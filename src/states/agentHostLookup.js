'use strict';

var http = require('http');

var exec = require('child_process').exec;
var atMostOnce = require('../util/atMostOnce');
var logger = require('../logger').getLogger('agentHostLookup');
var agentConnection = require('../agentConnection');

// Depending on the environment in which the agent and node sensor are running,
// the agent may be available under different hosts. For instance,
// when the agent and sensor are running on the same host outside any container,
// the host will probably be 127.0.0.1.
//
// The host differs, when the sensor is running inside a Docker container and the
// agent is running on the host.

var retryTimeoutMillis = 60 * 1000;

module.exports = {
  enter: enter,

  leave: function() {}
};


function enter(ctx) {
  checkHost('127.0.0.1', function onCheckHost(localhostCheckErr) {
    if (!localhostCheckErr) {
      setAgentHost('127.0.0.1');
      ctx.transitionTo('unannounced');
      return;
    }

    logger.debug(
      '127.0.0.1 is not running the agent. Trying default gateway...',
      {error: localhostCheckErr}
    );

    getDefaultGateway(function onGetDefaultGateway(getDefaultGatewayErr, defaultGateway) {
      if (getDefaultGatewayErr) {
        logger.info(
          'Agent cannot be contacted via localhost and default gateway cannot be determined. ' +
            'Scheduling reattempt of agent host lookup in %s millis.',
          retryTimeoutMillis,
          {error: getDefaultGatewayErr}
        );
        setTimeout(enter, retryTimeoutMillis, ctx);
        return;
      }

      checkHost(defaultGateway, function onCheckHostDefaultGateway(defaultGatewayCheckErr) {
        if (!defaultGatewayCheckErr) {
          setAgentHost(defaultGateway);
          ctx.transitionTo('unannounced');
          return;
        }

        logger.info(
          'Agent cannot be contacted via localhost nor via default gateway %s. ' +
            'Scheduling reattempt of agent host lookup in %s millis.',
          defaultGateway,
          retryTimeoutMillis,
          {error: defaultGatewayCheckErr}
        );
        setTimeout(enter, retryTimeoutMillis, ctx);
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
  cb = atMostOnce('callback for checkHost', cb);

  var req = http.request({
    host: host,
    port: agentConnection.port,
    path: '/',
    method: 'GET',
  }, function(res) {
    if (res.headers.server === agentConnection.serverHeader) {
      cb(null);
    } else {
      cb(new Error('Host ' + host +
        ' did not respond with expected agent header. Got: ' +
        res.headers.server));
    }
  });

  req.setTimeout(5000, function onTimeout() {
    cb(new Error('Host check timed out'));
  });

  req.on('error', function(err) {
    cb(new Error('Host check failed: ' + err.message));
  });

  req.end();
}


function setAgentHost(host) {
  logger.info('Attempting agent communication via %s:%s', host, agentConnection.port);
  agentConnection.setAgentHost(host);
}
