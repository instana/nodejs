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

const instanaEndpointUrlEnvVar = 'INSTANA_ENDPOINT_URL';
const instanaAgentKeyEnvVar = 'INSTANA_AGENT_KEY';
// The following two environment variables are deprecated and will be removed soon.
const deprecatedInstanaUrlEnvVar = 'INSTANA_URL';
const deprecatedInstanaKeyEnvVar = 'INSTANA_KEY';
const instanaZoneEnvVar = 'INSTANA_ZONE';

let valid = false;
let backendHost = null;
let backendPort = null;
let backendPath = null;
let instanaAgentKey = null;

// eslint-disable-next-line no-undef-init
let tags = undefined;

exports.sendUnencryptedEnvVar = 'INSTANA_DEV_SEND_UNENCRYPTED';
exports.sendUnencrypted = process.env[exports.sendUnencryptedEnvVar] === 'true';

const customZone = process.env[instanaZoneEnvVar] ? process.env[instanaZoneEnvVar] : undefined;

exports.validate = function validate() {
  _validate(
    process.env[instanaEndpointUrlEnvVar] || process.env[deprecatedInstanaUrlEnvVar],
    process.env[instanaAgentKeyEnvVar] || process.env[deprecatedInstanaKeyEnvVar]
  );
};

// exposed for testing
exports._reset = function _reset() {
  valid = false;
  backendHost = null;
  backendPort = null;
};

function _validate(instanaEndpointUrl, _instanaAgentKey) {
  logger.debug(`${instanaEndpointUrlEnvVar}: ${instanaEndpointUrl}`);

  if (!instanaEndpointUrl) {
    logger.warn(`${instanaEndpointUrlEnvVar} is not set. No data will be reported to Instana.`);
    return;
  }

  const parsedUrl = parseUrl(instanaEndpointUrl);

  if (!parsedUrl) {
    logger.warn(
      `The value of ${instanaEndpointUrlEnvVar} (${instanaEndpointUrl}) does not seem to be a well-formed URL.` +
        ' No data will be reported to Instana.'
    );
    return;
  }

  if (!exports.sendUnencrypted && parsedUrl.protocol !== 'https:') {
    logger.warn(
      `The value of ${instanaEndpointUrlEnvVar} (${instanaEndpointUrl}) specifies a non-supported protocol: ` +
        `"${parsedUrl.protocol}". Only "https:" is supported. No data will be reported to Instana.`
    );
    return;
  }
  if (exports.sendUnencrypted && parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    logger.warn(
      `The value of ${instanaEndpointUrlEnvVar} (${instanaEndpointUrl}) specifies a non-supported protocol: ` +
        `"${parsedUrl.protocol}". Only "https:" and "http:" are supported. No data will be reported to Instana.`
    );
    return;
  }

  if (!parsedUrl.hostname || parsedUrl.hostname.length === 0) {
    logger.warn(
      `The value of ${instanaEndpointUrlEnvVar} (${instanaEndpointUrl}) does not seem to be a well-formed URL.` +
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

  instanaAgentKey = _instanaAgentKey;

  if (!instanaAgentKey || instanaAgentKey.length === 0) {
    logger.warn(`The environment variable ${instanaAgentKeyEnvVar} is not set. No data will be reported to Instana.`);
    return;
  }

  logger.debug(`INSTANA ENDPOINT HOST: ${backendHost}`);
  logger.debug(`INSTANA ENDPOINT PORT: ${backendPort}`);
  logger.debug(`INSTANA ENDPOINT PATH: ${backendPath}`);
  logger.debug(`INSTANA AGENT KEY: ${instanaAgentKey}`);
  valid = true;
}

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

exports.getInstanaAgentKey = function getInstanaAgentKey() {
  return instanaAgentKey;
};

exports.getCustomZone = function getCustomZone() {
  return customZone;
};

// exposed for testing
exports._parseTags = function _parseTags() {
  let tagsRaw = process.env.INSTANA_TAGS;
  if (!tagsRaw) {
    return;
  }
  tagsRaw = tagsRaw.trim();
  if (tagsRaw.length === 0) {
    return;
  }
  tags = tagsRaw
    .split(',')
    .map(kvPairString => kvPairString.split('='), 2)
    .reduce((collectedTags, kvPair) => {
      const tagName = kvPair[0].trim();
      if (kvPair.length === 1) {
        collectedTags[tagName] = null;
      } else {
        collectedTags[tagName] = kvPair[1];
      }
      return collectedTags;
    }, {});
};

// execute tag parsing immediately
exports._parseTags();

exports.getTags = function getTags() {
  return tags;
};

function parseUrl(value) {
  try {
    return new Url(value);
  } catch (e) {
    logger.warn(e.message);
    return null;
  }
}
