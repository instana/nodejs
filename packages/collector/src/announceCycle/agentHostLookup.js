/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const { atMostOnce } = require('@instana/core').util;
const { exec } = require('child_process');
const { http } = require('@instana/core').uninstrumentedHttp;

const agentOpts = require('../agent/opts');

const EXPECTED_SERVER_HEADER = 'Instana Agent';

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('announceCycle/agentHostLookup', newLogger => {
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

const retryTimeoutMillis = 60 * 1000;

module.exports = {
  enter,
  leave: function () {}
};

/**
 * @param {import('./').AnnounceCycleContext} ctx
 */
function enter(ctx) {
  const agentHost = agentOpts.host;

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
          'Agent cannot be contacted via %s:%s and default gateway cannot be determined. ' +
            'Scheduling reattempt of agent host lookup in %s millis.',
          agentHost,
          agentOpts.port,
          retryTimeoutMillis
        );
        const defaultGatewayRetryTimeout = setTimeout(enter, retryTimeoutMillis, ctx);
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
          'Agent cannot be contacted via %s:%s nor via default gateway %s:%s. ' +
            'Scheduling reattempt of agent host lookup in %s millis.',
          agentHost,
          agentOpts.port,
          defaultGateway,
          agentOpts.port,
          retryTimeoutMillis
        );
        const checkHostRetryTimeout = setTimeout(enter, retryTimeoutMillis, ctx);
        checkHostRetryTimeout.unref();
      });
    });
  });
}

/**
 * @param {(err: Error, data?: string) => void} cb
 */
function getDefaultGateway(cb) {
  exec("/sbin/ip route | awk '/default/ { print $3 }'", (error, stdout, stderr) => {
    if (error !== null || stderr.length > 0) {
      cb(new Error(`Failed to retrieve default gateway: ${stderr}`));
    } else {
      cb(null, stdout.trim());
    }
  });
}

/**
 * @param {string} host
 * @param {(...args: *) => *} cb
 */
function checkHost(host, cb) {
  cb = atMostOnce(`callback for checkHost: ${host}`, cb);

  let req;
  try {
    req = http.request(
      {
        host,
        port: agentOpts.port,
        path: '/',
        agent: http.agent,
        method: 'GET'
      },
      res => {
        if (res.headers.server === EXPECTED_SERVER_HEADER) {
          cb(null);
        } else {
          cb(
            new Error(
              `Host ${host}:${agentOpts.port} did not respond with expected agent header. Got: ${res.headers.server}`
            )
          );
        }
        res.resume();
      }
    );
  } catch (e) {
    cb(new Error(`Host lookup failed due to: ${e.message}`));
    return;
  }

  req.setTimeout(5000, function onTimeout() {
    cb(new Error('Host check timed out'));
  });

  req.on('error', err => {
    cb(new Error(`Host check failed: ${err.message}`));
  });

  req.end();
}

/**
 * @param {string} host
 */
function setAgentHost(host) {
  logger.info('Attempting agent communication via %s:%s', host, agentOpts.port);
  agentOpts.host = host;
}
