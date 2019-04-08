'use strict';

// TODO Send via HTTP2 if possible.
const https = require('https');

const constants = require('@instana/core');
const instanaUrlUtil = require('../util/instana_url');
const logger = require('../util/logger');

const timeoutEnvVar = 'INSTANA_TIMEOUT';
const defaultTimeout = 250;
const acceptorTimeout = process.env[timeoutEnvVar] || defaultTimeout;

const acceptSelfSignedCertEnvVar = 'INSTANA_DEV_ACCEPT_SELF_SIGNED_CERT';
const acceptSelfSignedCert = process.env[acceptSelfSignedCertEnvVar] === 'true';

// TODO We need to use X-INSTANA-L=0 for all requests!!

exports.sendBundle = function sendBundle(bundle, callback) {
  send('/bundle', bundle, callback);
};

exports.sendMetrics = function sendMetrics(metrics, callback) {
  send('/metrics', metrics, callback);
};

exports.sendSpans = function sendSpans(spans, callback) {
  send('/spans', spans, callback);
};

function send(resourcePath, payload, callback) {
  if (acceptSelfSignedCert) {
    logger.error(
      `${acceptSelfSignedCertEnvVar} is set, which means that the server certificate will not be verified against the list of known CAs. This makes your lambda vulnerable to MITM attacks when connecting to Instana. This setting should never be used in production.`
    );
  }

  payload = JSON.stringify(payload);

  const options = {
    hostname: instanaUrlUtil.getAcceptorHost(),
    port: instanaUrlUtil.getAcceptorPort(),
    path: resourcePath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      [constants.traceLevelHeaderName]: '0'
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
