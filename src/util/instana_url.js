'use strict';

const semver = require('semver');

const logger = require('./logger');

let parseFn;

if (semver.gte(process.version, '6.13.0')) {
  // prefer WHATWG URL API in more recent Node.js versions
  let Url;
  if (semver.gte(process.version, '10.0.0')) {
    // Beginning with 10.0.0, the WHATWG URL constructor is available globally.
    Url = URL;
  } else {
    // In Node.js >= 6.13.0 and < 10.0.0, the WHATWG URL constructor needs to be required explicitly
    Url = require('url').URL;
  }
  parseFn = value => {
    try {
      return new Url(value);
    } catch (e) {
      logger.warn(e.message);
      return null;
    }
  };
} else {
  // fall back to legacy URL API for older Node.js versions
  parseFn = require('url').parse;
}

const instanaUrlEnvVar = 'INSTANA_URL';
let valid = false;
let acceptorHost = null;
let acceptorPort = null;

exports.validate = function validate() {
  exports._validateUrl(process.env[instanaUrlEnvVar]);
};

// exposed for testing
exports._reset = function _reset() {
  valid = false;
  acceptorHost = null;
  acceptorPort = null;
};

// exposed for testing
exports._validateUrl = function _validateUrl(instanaUrl) {
  logger.debug(`${instanaUrlEnvVar}: ${instanaUrl}`);

  if (!instanaUrl) {
    logger.warn(`${instanaUrlEnvVar} is not set. No data will be reported to Instana.`);
    return;
  }

  const parsedUrl = parseFn(instanaUrl);

  if (!parsedUrl) {
    logger.warn(
      `The value of ${instanaUrlEnvVar} (${instanaUrl}) does not seem to be a well-formed URL.` +
        ' No data will be reported to Instana.'
    );
    return;
  }

  if (parsedUrl.protocol !== 'https:') {
    logger.warn(
      `The value of ${instanaUrlEnvVar} (${instanaUrl}) specifies a non-supported protocol: "${parsedUrl.protocol}".` +
        ' Only "https:" is supported. No data will be reported to Instana.'
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

  acceptorHost = parsedUrl.hostname;
  acceptorPort = parsedUrl.port;
  if (!acceptorPort || acceptorPort.length === 0) {
    acceptorPort = '443';
  }

  logger.debug(`INSTANA HOST: ${acceptorHost}`);
  logger.debug(`INSTANA PORT: ${acceptorPort}`);
  valid = true;
};

exports.isValid = function isValid() {
  return valid;
};

exports.getAcceptorHost = function getAcceptorHost() {
  return acceptorHost;
};

exports.getAcceptorPort = function getAcceptorPort() {
  return acceptorPort;
};
