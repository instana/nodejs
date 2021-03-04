/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// eslint-disable-next-line import/order
const environmentUtil = require('./environment');

const uninstrumented = require('@instana/core').uninstrumentedHttp;

const semver = require('semver');

const constants = require('./constants');
let logger = require('./console_logger');

const https = environmentUtil.sendUnencrypted ? uninstrumented.http : uninstrumented.https;

const timeoutEnvVar = 'INSTANA_TIMEOUT';
let defaultTimeout = 500;
let backendTimeout = defaultTimeout;

const proxyEnvVar = 'INSTANA_ENDPOINT_PROXY';
let proxyAgent;

let stopSendingOnFailure = true;
let propagateErrorsUpstream = false;
let requestHasFailed = false;
let warningsHaveBeenLogged = false;

const needsEcdhCurveFix = semver.gte(process.version, '8.6.0') && semver.lt(process.version, '10.0.0');
const legacyTimeoutHandling = semver.lt(process.version, '9.0.0');

const disableCaCheckEnvVar = 'INSTANA_DISABLE_CA_CHECK';
const disableCaCheck = process.env[disableCaCheckEnvVar] === 'true';

if (process.env[proxyEnvVar] && !environmentUtil.sendUnencrypted) {
  const proxyUrl = process.env[proxyEnvVar];
  logger.info(
    `The environment variable ${proxyEnvVar} is set. Requests to the Instana back end will be routed via a proxy ` +
      `server: ${proxyUrl}.`
  );

  const HttpsProxyAgent = require('https-proxy-agent');
  proxyAgent = new HttpsProxyAgent(proxyUrl);
} else if (process.env[proxyEnvVar] && environmentUtil.sendUnencrypted) {
  logger.warn(
    `Both ${proxyEnvVar} and ${environmentUtil.sendUnencryptedEnvVar} are set, but this combination is not supported.` +
      ' Requests to the Instana back end will not be routed via a proxy server.'
  );
}

let hostHeader;

exports.init = function init(
  identityProvider,
  _logger,
  _stopSendingOnFailure,
  _propagateErrorsUpstream,
  _defaultTimeout
) {
  stopSendingOnFailure = _stopSendingOnFailure == null ? true : _stopSendingOnFailure;
  propagateErrorsUpstream = _propagateErrorsUpstream == null ? false : _propagateErrorsUpstream;
  defaultTimeout = _defaultTimeout == null ? defaultTimeout : _defaultTimeout;

  backendTimeout = defaultTimeout;
  if (process.env[timeoutEnvVar]) {
    backendTimeout = parseInt(process.env[timeoutEnvVar], 10);
    if (isNaN(backendTimeout) || backendTimeout < 0) {
      logger.warn(
        `The value of ${timeoutEnvVar} (${process.env[timeoutEnvVar]}) cannot be parsed to a valid numerical value. ` +
          `Will fall back to the default timeout (${defaultTimeout} ms).`
      );
      backendTimeout = defaultTimeout;
    }
  }

  if (identityProvider) {
    hostHeader = identityProvider.getHostHeader();
    if (hostHeader == null) {
      hostHeader = 'nodejs-serverless';
    }
  }

  logger = _logger;
  requestHasFailed = false;
};

exports.setLogger = function setLogger(_logger) {
  logger = _logger;
};

exports.sendBundle = function sendBundle(bundle, destroySocketAfterwards, callback) {
  send('/bundle', bundle, destroySocketAfterwards, callback);
};

exports.sendMetrics = function sendMetrics(metrics, callback) {
  send('/metrics', metrics, false, callback);
};

exports.sendSpans = function sendSpans(spans, callback) {
  send('/traces', spans, false, callback);
};

function send(resourcePath, payload, destroySocketAfterwards, callback) {
  if (requestHasFailed && stopSendingOnFailure) {
    logger.info(
      `Not attempting to send data to ${resourcePath} as a previous request has already timed out or failed.`
    );
    callback();
    return;
  } else {
    logger.debug(`Sending data to Instana (${resourcePath}).`);
  }

  if (!warningsHaveBeenLogged) {
    warningsHaveBeenLogged = true;
    if (environmentUtil.sendUnencrypted) {
      logger.error(
        `${environmentUtil.sendUnencryptedEnvVar} is set, which means that the all traffic to Instana is send ` +
          'unencrypted via plain HTTP, not via HTTPS. This will effectively make that traffic public. This setting ' +
          'should never be used in production.'
      );
    }
    if (disableCaCheck) {
      logger.warn(
        `${disableCaCheckEnvVar} is set, which means that the server certificate will not be verified against ` +
          'the list of known CAs. This makes your lambda vulnerable to MITM attacks when connecting to Instana. ' +
          'This setting should never be used in production, unless you use our on-premises product and are unable to ' +
          'operate the Instana back end with a certificate with a known root CA.'
      );
    }
  }

  // prepend backend's path if the configured URL has a path component
  if (environmentUtil.getBackendPath() !== '/') {
    resourcePath = environmentUtil.getBackendPath() + resourcePath;
  }

  // serialize the payload object
  payload = JSON.stringify(payload);

  const options = {
    hostname: environmentUtil.getBackendHost(),
    port: environmentUtil.getBackendPort(),
    path: resourcePath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      [constants.xInstanaHost]: hostHeader,
      [constants.xInstanaKey]: environmentUtil.getInstanaAgentKey(),
      [constants.xInstanaTime]: Date.now()
    },
    rejectUnauthorized: !disableCaCheck
  };

  if (!legacyTimeoutHandling) {
    // The timeout specified here in the request options will kick in if *connecting* to the socket takes too long.
    // From https://nodejs.org/api/http.html#http_http_request_options_callback:
    // > timeout <number>: A number specifying the socket timeout in milliseconds. This will set the timeout *before* the
    // > socket is connected.
    // In contrast, the timeout handling of req.on('timeout', () => { ... }) (see below) will only kick in if the
    // underlying socket has been inactive for the specified time *after* the connection has been established, but not
    // if connecting to the socket takes too long.
    //
    // Side Note about legacyTimeoutHandling: See below at the req.setTimeout usage for an explanation why this is
    // handled differently in Node.js 8 Lambda runtimes.
    options.timeout = backendTimeout;
  }
  if (proxyAgent) {
    options.agent = proxyAgent;
  }

  if (needsEcdhCurveFix) {
    // Requests to K8s based back ends fail on Node.js 8.10 without this option, due to a bug in all
    // Node.js versions >= 8.6.0 and < 10.0.0, see https://github.com/nodejs/node/issues/19359 and
    // https://github.com/nodejs/node/issues/16196#issuecomment-336647658.
    options.ecdhCurve = 'auto';
  }

  const req = https.request(options, () => {
    if (destroySocketAfterwards) {
      // This is the final request from an AWS Lambda. In some scenarios we might get a stale timeout event on the
      // socket object from a previous invocation of the Lambda handler, that is, from before the AWS Lambda runtime
      // froze the Node.js process. Manually destroying the socket at the end of the Lambda invocation is a workaround
      // for that.
      req.socket.destroy();
    }
    callback();
  });

  if (legacyTimeoutHandling) {
    // In Node.js 8, this establishes a read timeout as well as a connection timeout (which is what we want). In
    // Node.js 9 and above, that behaviour changed, see
    // https://nodejs.org/api/http.html#http_request_settimeout_timeout_callback -> history:
    // v9.0.0	- Consistently set socket timeout only when the socket connects.

    req.setTimeout(backendTimeout, () => onTimeout(req, callback));
  } else {
    // See above for the difference between the timeout attribute in the request options and handling the 'timeout'
    // event. This only adds a read timeout after the connection has been established and we need the timout attribute
    // in the request options additionally for protection against cases where *connecting* to the socket takes too long,
    // see https://nodejs.org/api/http.html#http_request_settimeout_timeout_callback:
    // > Once a socket is assigned to this request **and is connected**
    // > socket.setTimeout() will be called.
    req.on('timeout', () => onTimeout(req, callback));
  }

  req.on('error', e => {
    requestHasFailed = true;
    if (!propagateErrorsUpstream) {
      logger.warn('Could not send traces and metrics to Instana. The Instana back end seems to be unavailable.', e);
    }
    callback(propagateErrorsUpstream ? e : undefined);
  });

  req.end(payload);
}

function onTimeout(req, callback) {
  requestHasFailed = true;

  // We need to destroy the request manually, otherwise it keeps the runtime running (and timing out) when
  // (a) the wrapped Lambda handler uses the callback API, and
  // (b) context.callbackWaitsForEmptyEventLoop = false is not set.
  // Also, the Node.js documentation mandates to destroy the request manually in case of a timeout. See
  // https://nodejs.org/api/http.html#http_event_timeout.
  if (req && !req.destroyed) {
    try {
      req.destroy();
    } catch (e) {
      // ignore
    }
  }

  const message =
    'Could not send traces and metrics to Instana. The Instana back end did not respond in the configured timeout ' +
    `of ${backendTimeout} ms. The timeout can be configured by setting the environment variable ${timeoutEnvVar}.`;

  if (!propagateErrorsUpstream) {
    logger.warn(message);
  }
  callback(propagateErrorsUpstream ? new Error(message) : undefined);
}
