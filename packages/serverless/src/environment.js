/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const instanaEndpointUrlEnvVar = 'INSTANA_ENDPOINT_URL';
const instanaAgentKeyEnvVar = 'INSTANA_AGENT_KEY';
const instanaZoneEnvVar = 'INSTANA_ZONE';

let logger;
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

exports.init = config => {
  logger = config.logger;
};

exports.validate = function validate({ validateInstanaAgentKey } = {}) {
  _validate(process.env[instanaEndpointUrlEnvVar], process.env[instanaAgentKeyEnvVar], validateInstanaAgentKey);
};

// exposed for testing
exports._reset = function _reset() {
  valid = false;
  backendHost = null;
  backendPort = null;
};

function _validate(instanaEndpointUrl, _instanaAgentKey, validateInstanaAgentKey) {
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

  backendPath = sanitizePath(parsedUrl.pathname);

  instanaAgentKey = _instanaAgentKey;

  /**
   * process.env.INSTANA_AGENT_KEY has priority over any fallback strategy
   * That means for the whole system: if there is no process.env.INSTANA_AGENT_KEY
   * and the fallback strategy won't work either, we skip sending data to the BE.
   */
  if (!instanaAgentKey || instanaAgentKey.length === 0) {
    const result = validateInstanaAgentKey ? validateInstanaAgentKey() : null;

    if (!result) {
      logger.warn(`The environment variable ${instanaAgentKeyEnvVar} is not set. No data will be reported to Instana.`);
      return;
    }
  } else {
    logger.debug(`INSTANA AGENT KEY: ${instanaAgentKey}`);
  }

  logger.debug(`INSTANA ENDPOINT HOST: ${backendHost}`);
  logger.debug(`INSTANA ENDPOINT PORT: ${backendPort}`);
  logger.debug(`INSTANA ENDPOINT PATH: ${backendPath}`);

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

exports.setInstanaAgentKey = function setInstanaAgentKey(key) {
  instanaAgentKey = key;
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
    return new URL(value);
  } catch (e) {
    logger.warn(e.message);
    return null;
  }
}

// Removes trailing slashes from the path (except when it's just '/')
// Prevents double slashes when building backend URLs.
// Example: "https://example.instana.io/serverless/" + "/bundle" → "https://example.instana.io/serverless/bundle"
function sanitizePath(pathName) {
  if (!pathName || pathName === '/') {
    return pathName;
  }
  return pathName.replace(/\/+$/, '');
}
