/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const { atMostOnce } = require('@instana/core').util;
const { exec } = require('child_process');
const { http } = require('@instana/core').uninstrumentedHttp;

const agentOpts = require('../agent/opts');

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

const requestTimeout = 5000;
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

    logger.debug(
      `No Instana host agent is running on ${agentHost}:${agentOpts.port}: ${localhostCheckErr}. Trying the default ` +
        'gateway next.'
    );

    getDefaultGateway(function onGetDefaultGateway(getDefaultGatewayErr, defaultGateway) {
      if (getDefaultGatewayErr) {
        logger.warn(
          `The Instana host agent cannot be reached via ${agentHost}:${agentOpts.port} and the default gateway ` +
            `cannot be determined. Details: Error for the connection attempt: ${safelyExtractErrorMessage(
              localhostCheckErr
            )}; error for determining the gateway: ${safelyExtractErrorMessage(
              getDefaultGatewayErr
            )}. The Instana host agent might not be ready yet, scheduling another attempt to establish a connection ` +
            `in ${retryTimeoutMillis} ms.`
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

        logger.warn(
          `The Instana host agent can neither be reached via ${agentHost}:${agentOpts.port} nor via the default ` +
            `gateway ${defaultGateway}:${agentOpts.port}. Details: Error for the first attempt: ` +
            `${safelyExtractErrorMessage(localhostCheckErr)}; error for the second attempt: ${safelyExtractErrorMessage(
              defaultGatewayCheckErr
            )}. The Instana host agent might not be ready yet, scheduling another attempt to establish a connection ` +
            `in ${retryTimeoutMillis} ms.`
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
        method: 'GET',
        // timeout for establishing a connection
        timeout: requestTimeout
      },
      res => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cb(null);
        } else {
          cb(
            new Error(
              `The attempt to connect to the Instana host agent on ${host}:${agentOpts.port} has failed with an ` +
                `unexpected status code. Expected HTTP 200 but received: ${res.statusCode}`
            )
          );
        }
        res.resume();
      }
    );
  } catch (e) {
    cb(
      new Error(
        `The attempt to connect to the Instana host agent on ${host}:${agentOpts.port} has failed with the following ` +
          `error: ${e.message}`
      )
    );
    return;
  }

  req.on('timeout', function onTimeout() {
    cb(new Error(`The attempt to connect to the Instana host agent on ${host}:${agentOpts.port} has timed out`));
  });

  // additional idle timeout (that is, not getting a response after establishing a connection)
  req.setTimeout(requestTimeout);

  req.on('error', err => {
    cb(
      new Error(
        `The attempt to connect to the Instana host agent on ${host}:${agentOpts.port} has failed with the following ` +
          `error: ${err.message}`
      )
    );
  });

  req.end();
}

/**
 * @param {Error} error
 */
function safelyExtractErrorMessage(error) {
  if (error == null) {
    return null;
  }
  if (error.message) {
    return error.message;
  }
  return error;
}

/**
 * @param {string} host
 */
function setAgentHost(host) {
  logger.info('Trying to reach the Instana host agent on %s:%s', host, agentOpts.port);
  agentOpts.host = host;
}
