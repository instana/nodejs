'use strict';

const environmentUtil = require('../util/environment');

// TODO Send via HTTP2 if possible.
const https = environmentUtil.sendUnencrypted ? require('http') : require('https');

const constants = require('@instana/core');
const logger = require('../util/logger');

const timeoutEnvVar = 'INSTANA_TIMEOUT';
const defaultTimeout = 500;
let acceptorTimeout = defaultTimeout;

let warningsHaveBeenLogged = false;

if (process.env[timeoutEnvVar]) {
  acceptorTimeout = parseInt(process.env[timeoutEnvVar], 10);
  if (isNaN(acceptorTimeout) || acceptorTimeout < 0) {
    console.warn(
      `The value of ${timeoutEnvVar} (${
        process.env[timeoutEnvVar]
      }) cannot be parsed to a valid numerical value. Will fall back to the default timeout (${defaultTimeout} ms).`
    );
    acceptorTimeout = defaultTimeout;
  }
}

const acceptSelfSignedCertEnvVar = 'INSTANA_DEV_ACCEPT_SELF_SIGNED_CERT';
const acceptSelfSignedCert = process.env[acceptSelfSignedCertEnvVar] === 'true';

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
        `${
          environmentUtil.sendUnencryptedEnvVar
        } is set, which means that the all traffic to Instana is send unencrypted via plain HTTP, not via HTTPS. This will effectively make that traffic public. This setting should never be used in production.`
      );
    }
    if (acceptSelfSignedCert) {
      logger.error(
        `${acceptSelfSignedCertEnvVar} is set, which means that the server certificate will not be verified against the list of known CAs. This makes your lambda vulnerable to MITM attacks when connecting to Instana. This setting should never be used in production.`
      );
    }
  }

  payload = JSON.stringify(payload);
  const options = {
    hostname: environmentUtil.getAcceptorHost(),
    port: environmentUtil.getAcceptorPort(),
    path: resourcePath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      [constants.traceLevelHeaderName]: '0',
      'x-instana-host': 'aws-lambda',
      'x-instana-key': environmentUtil.getInstanaKey(),
      'x-instana-time': Date.now()
    },

    rejectUnauthorized: !acceptSelfSignedCert
  };

  const req = https.request(options, res => {
    const unexpectedStatus = res.statusCode < 200 || res.statusCode >= 300;
    let data = '';
    res.setEncoding('utf8');
    res.on('data', chunk => {
      // Ignore response data unless we received an HTTP status code indicating a problem.
      if (unexpectedStatus) {
        data += chunk;
      }
    });
    res.on('end', () => {
      if (unexpectedStatus) {
        return callback(
          new Error(
            `Received an unexpected HTTP status (${res.statusCode}) from the Instana back end. Message: ${data}`
          )
        );
      }
      return callback();
    });
  });
  req.setTimeout(acceptorTimeout, () => {
    callback(
      new Error(
        `The Instana back end did not respond in the configured timeout of ${acceptorTimeout} ms.` +
          (acceptorTimeout === defaultTimeout
            ? ` The timeout can be configured by setting the environment variable ${timeoutEnvVar}.`
            : '')
      )
    );
  });

  req.on('error', e => {
    callback(e);
  });

  req.write(payload);
  req.end();
}
