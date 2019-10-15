'use strict';

const semver = require('semver');

const logger = require('./console_logger');

let Url;
if (semver.gte(process.version, '10.0.0')) {
  // Beginning with 10.0.0, the WHATWG URL constructor is available globally.
  Url = URL;
} else {
  // In Node.js >= 6.13.0 and < 10.0.0, the WHATWG URL constructor needs to be required explicitly
  Url = require('url').URL;
}

const instanaUrlEnvVar = 'INSTANA_URL';
const instanaKeyEnvVar = 'INSTANA_KEY';
let valid = false;
let backendHost = null;
let backendPort = null;
let backendPath = null;
let instanaKey = null;

exports.sendUnencryptedEnvVar = 'INSTANA_DEV_SEND_UNENCRYPTED';
exports.sendUnencrypted = process.env[exports.sendUnencryptedEnvVar] === 'true';

exports.validate = function validate() {
  exports._validate(process.env[instanaUrlEnvVar], process.env[instanaKeyEnvVar]);
};

// exposed for testing
exports._reset = function _reset() {
  valid = false;
  backendHost = null;
  backendPort = null;
};

// exposed for testing
exports._validate = function _validate(instanaUrl, _instanaKey) {
  logger.debug(`${instanaUrlEnvVar}: ${instanaUrl}`);

  if (!instanaUrl) {
    logger.warn(`${instanaUrlEnvVar} is not set. No data will be reported to Instana.`);
    return;
  }

  const parsedUrl = parseUrl(instanaUrl);

  if (!parsedUrl) {
    logger.warn(
      `The value of ${instanaUrlEnvVar} (${instanaUrl}) does not seem to be a well-formed URL.` +
        ' No data will be reported to Instana.'
    );
    return;
  }

  if (!exports.sendUnencrypted && parsedUrl.protocol !== 'https:') {
    logger.warn(
      `The value of ${instanaUrlEnvVar} (${instanaUrl}) specifies a non-supported protocol: "${parsedUrl.protocol}".` +
        ' Only "https:" is supported. No data will be reported to Instana.'
    );
    return;
  }
  if (exports.sendUnencrypted && parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    logger.warn(
      `The value of ${instanaUrlEnvVar} (${instanaUrl}) specifies a non-supported protocol: "${parsedUrl.protocol}".` +
        ' Only "https:" and "http:" are supported. No data will be reported to Instana.'
    );
    return;
  }

  if (!parsedUrl.hostname || parsedUrl.hostname.length === 0) {
    logger.warn(
      `The value of ${instanaUrlEnvVar} (${instanaUrl}) does not seem to be a well-formed URL.` +
        ' No data will be reported to Instana.'
    );
    return;
  }

  backendHost = parsedUrl.hostname;
  backendPort = parsedUrl.port;
  if (!backendPort || backendPort.length === 0) {
    backendPort = '443';
  }

  backendPath = parsedUrl.pathname;

  instanaKey = _instanaKey;

  if (!instanaKey || instanaKey.length === 0) {
    logger.warn(`The environment variable ${instanaKeyEnvVar} is not set. No data will be reported to Instana.`);
    return;
  }

  logger.debug(`INSTANA HOST: ${backendHost}`);
  logger.debug(`INSTANA PORT: ${backendPort}`);
  logger.debug(`INSTANA PATH: ${backendPath}`);
  logger.debug(`INSTANA KEY: ${instanaKey}`);
  valid = true;
};

exports.isValid = function isValid() {
  return valid;
};

exports.getBackendHost = function getBackendHost() {
  return backendHost;
};

exports.getBackendPort = function getBackendPort() {
  return backendPort;
};

exports.getBackendPath = function getBackendPath() {
  return backendPath;
};

exports.getInstanaKey = function getInstanaKey() {
  return instanaKey;
};

function parseUrl(value) {
  try {
    return new Url(value);
  } catch (e) {
    logger.warn(e.message);
    return null;
  }
}
