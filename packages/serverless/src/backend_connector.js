'use strict';

// eslint-disable-next-line import/order
const environmentUtil = require('./environment');

// backend_connector is required from aws_lambda/wrapper before initializing @instana/core, that is, in particular,
// before tracing is initialized. Thus we always get an uninstrumented https module here.
const https = environmentUtil.sendUnencrypted ? require('http') : require('https');
const semver = require('semver');

const constants = require('./constants');
let logger = require('./console_logger');

const timeoutEnvVar = 'INSTANA_TIMEOUT';
const defaultTimeout = 500;
let backendTimeout = defaultTimeout;

let warningsHaveBeenLogged = false;

const needsEcdhCurveFix = semver.lt(process.version, '10.0.0');

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

const acceptSelfSignedCertEnvVar = 'INSTANA_DEV_ACCEPT_SELF_SIGNED_CERT';
const acceptSelfSignedCert = process.env[acceptSelfSignedCertEnvVar] === 'true';

let identityProvider;

exports.init = function init(identityProvider_, logger_) {
  identityProvider = identityProvider_;
  logger = logger_;
};

exports.sendBundle = function sendBundle(bundle, callback) {
  send('/bundle', bundle, callback);
};

exports.sendMetrics = function sendMetrics(metrics, callback) {
  send('/metrics', metrics, callback);
};

exports.sendSpans = function sendSpans(spans, callback) {
  send('/traces', spans, callback);
};

function send(resourcePath, payload, callback) {
  if (!warningsHaveBeenLogged) {
    warningsHaveBeenLogged = true;
    if (environmentUtil.sendUnencrypted) {
      logger.error(
        `${environmentUtil.sendUnencryptedEnvVar} is set, which means that the all traffic to Instana is send ` +
          'unencrypted via plain HTTP, not via HTTPS. This will effectively make that traffic public. This setting ' +
          'should never be used in production.'
      );
    }
    if (acceptSelfSignedCert) {
      logger.error(
        `${acceptSelfSignedCertEnvVar} is set, which means that the server certificate will not be verified against ` +
          'the list of known CAs. This makes your lambda vulnerable to MITM attacks when connecting to Instana. ' +
          'This setting should never be used in production.'
      );
    }
  }

  // prepend backend's path if the configured URL has a path component
  if (environmentUtil.getBackendPath() !== '/') {
    resourcePath = environmentUtil.getBackendPath() + resourcePath;
  }

  payload = JSON.stringify(payload);
  const options = {
    hostname: environmentUtil.getBackendHost(),
    port: environmentUtil.getBackendPort(),
    path: resourcePath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      [constants.xInstanaHost]: identityProvider ? identityProvider.getHostHeader() : 'nodejs-aws-lambda',
      [constants.xInstanaKey]: environmentUtil.getInstanaAgentKey(),
      [constants.xInstanaTime]: Date.now()
    },
    rejectUnauthorized: !acceptSelfSignedCert
  };

  if (needsEcdhCurveFix) {
    // Requests to K8s based back ends fail on Node.js 8.10 without this option, due to a bug in all
    // Node.js versions >= 8.6.0 and < 10.0.0, see https://github.com/nodejs/node/issues/19359 and
    // https://github.com/nodejs/node/issues/16196#issuecomment-336647658.
    options.ecdhCurve = 'auto';
  }

  // We deliberately do not pass a callback when calling https.request but instead we pass the callback to req.end.
  // This way, we do not wait for the HTTP _response_, but we still make sure the request data is written to the network
  // completely. This reduces the delay we add to the Lambda execution time to report metrics and traces quite a bit.
  // The (acceptable) downside is that we do not get to examine the response for HTTP status codes.
  const req = https.request(options);

  req.setTimeout(backendTimeout, () => {
    callback(
      new Error(
        `The Instana back end did not respond in the configured timeout of ${backendTimeout} ms. The timeout can be ` +
          `configured by setting the environment variable ${timeoutEnvVar}.`
      )
    );
  });

  req.on('error', e => {
    callback(e);
  });

  req.end(payload, () =>
    // We finish as soon as the request has been flushed, without waiting for the response.
    callback()
  );
}
