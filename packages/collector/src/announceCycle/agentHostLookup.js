/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const { callbackify } = require('util');
const { atMostOnce } = require('@instana/core').util;
const { http } = require('@instana/core').uninstrumentedHttp;

const agentOpts = require('../agent/opts');
const defaultGatewayParser = require('./defaultGatewayParser');
const readDefaultGateway = callbackify(defaultGatewayParser.parseProcSelfNetRouteFile);

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('announceCycle/agentHostLookup', newLogger => {
  logger = newLogger;
});

/* eslint-disable max-len */
/*
 * Tries to find a listening Instana host agent. The agent should usually be running on the same physical host, but
 * may be reachable via various different IPs, depending on the environment, that is, whether the Node.js process is
 * running directly on the physical host, in a container, or in a pod via container orchestration.
 *
 * Steps:
 * 1. Check either the configured IP and port (e.g. INSTANA_AGENT_HOST:INSTANA_AGENT_PORT) or the default
 *    (127.0.0.1:42699), or a combination of configured IP & default port or vice versa. (In Kubernetes/OpenShift, we
 *    assume that INSTANA_AGENT_HOST is set via a fieldRef to status.hostIP, see
 *    https://www.ibm.com/docs/en/instana-observability/current?topic=agents-installing-host-agent-kubernetes#configure-network-access-for-monitored-applications)
 * 2. If nothing is listening on the IP/port determined in step (1.), we try to determine the default gateway IP and try
 *    to connect to that IP (still with the configured port or default port if nothing is configured). This is aimed
 *    at Node.js processes running in a container but without container orchestration like K8s.
 * 3. If (2.) also fails (either because we cannot determine a default gateway IP or because nothing is listening
 *    there), we schedule a retry, starting at (1.) again.
 */
/* eslint-enable max-len */

const requestTimeout = 5000;
const retryTimeoutMillis = process.env.INSTANA_RETRY_AGENT_CONNECTION_IN_MS
  ? Number(process.env.INSTANA_RETRY_AGENT_CONNECTION_IN_MS)
  : 60 * 1000;

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

    readDefaultGateway(function onReadDefaultGateway(getDefaultGatewayErr, defaultGateway) {
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

        setTimeout(enter, retryTimeoutMillis, ctx).unref();
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
        setTimeout(enter, retryTimeoutMillis, ctx).unref();
      });
    });
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
          handleResponse(host, res, cb);
        } else {
          // We are not interested in the body of a non-2xx HTTP response, but since we have added a response handler,
          // we must consume the response body, see https://nodejs.org/api/http.html#class-httpclientrequest.
          res.resume();
          cb(
            new Error(
              `The attempt to connect to the Instana host agent on ${host}:${agentOpts.port} has failed with an ` +
                `unexpected status code. Expected HTTP 200 but received: ${res.statusCode}`
            )
          );
        }
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
 * Checks the response payload to determine whether we have actually connected to an Instana host agent.
 *
 * @param {string} host the target IP (will only be used for logging in this method)
 * @param {import('http').IncomingMessage} res the HTTP response
 * @param {(...args: *) => *} cb
 */
function handleResponse(host, res, cb) {
  /* eslint-disable max-len */
  // We inspect the payload, checking whether it is JSON and has the "version" property, to verify that we have
  // actually connected to an Instana host agent. See
  // https://github.ibm.com/instana/technical-documentation/blob/master/tracing/specification/README.md#phase-1--host-lookup
  /* eslint-enable max-len */

  res.setEncoding('utf8');
  let responsePayload = '';
  res.on('data', chunk => {
    responsePayload += chunk;
  });
  res.on('end', () => {
    let responseJson;
    try {
      responseJson = JSON.parse(responsePayload);
    } catch (e) {
      cb(
        new Error(
          `The attempt to connect to the Instana host agent on ${host}:${agentOpts.port} has failed, the response ` +
            `cannot be parsed as JSON. The party listening on ${host}:${agentOpts.port} does not seem to be an ` +
            `Instana host agent. Full response: ${responsePayload}`
        )
      );
      return;
    }
    if (responseJson.version !== undefined) {
      cb(null);
    } else {
      cb(
        new Error(
          `The attempt to connect to the Instana host agent on ${host}:${agentOpts.port} has failed, the response did` +
            ` not have a "version" property. The party listening on ${host}:${agentOpts.port} does not seem to be an ` +
            `Instana host agent. Full response: ${responsePayload}`
        )
      );
    }
  });
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
  logger.info('Found an agent on %s:%s, proceeding to announce request.', host, agentOpts.port);
  agentOpts.host = host;
}
