/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

/** @type {import('./core').GenericLogger} */
let logger;
const defaultSecrets = ['key', 'pass', 'secret'];
const matchers = {
  /**
   * @param {Array.<string>} secrets
   * @returns {(key: string) => boolean}
   */
  'equals-ignore-case': function createEqualsIgnoreCaseMatcher(secrets) {
    secrets = toLowerCase(secrets);
    return function isSecret(key) {
      if (key == null || typeof key !== 'string') {
        return false;
      }
      for (let i = 0; i < secrets.length; i++) {
        if (key.toLowerCase() === secrets[i]) {
          return true;
        }
      }
      return false;
    };
  },

  /**
   * @param {Array.<string>} secrets
   * @returns {(key: string) => boolean}
   */
  equals: function createEqualsMatcher(secrets) {
    secrets = checkSecrets(secrets);
    return function isSecret(key) {
      if (key == null || typeof key !== 'string') {
        return false;
      }
      for (let i = 0; i < secrets.length; i++) {
        if (key === secrets[i]) {
          return true;
        }
      }
      return false;
    };
  },

  /**
   * @param {Array.<string>} secrets
   * @returns {(key: string) => boolean}
   */
  'contains-ignore-case': function createContainsIgnoreCaseMatcher(secrets) {
    secrets = toLowerCase(secrets);
    return function isSecret(key) {
      if (key == null || typeof key !== 'string') {
        return false;
      }
      for (let i = 0; i < secrets.length; i++) {
        if (key.toLowerCase().indexOf(secrets[i]) >= 0) {
          return true;
        }
      }
      return false;
    };
  },

  /**
   * @param {Array.<string>} secrets
   * @returns {(key: string) => boolean}
   */
  contains: function createContainsMatcher(secrets) {
    secrets = checkSecrets(secrets);
    return function isSecret(key) {
      if (key == null || typeof key !== 'string') {
        return false;
      }
      for (let i = 0; i < secrets.length; i++) {
        if (key.indexOf(secrets[i]) >= 0) {
          return true;
        }
      }
      return false;
    };
  },

  /**
   * @param {Array.<string>} secrets
   * @returns {(key: string) => boolean}
   */
  regex: function createRegexMatcher(secrets) {
    secrets = checkSecrets(secrets);
    /** @type {Array.<RegExp>} */
    const regexes = [];
    secrets.forEach(regexString => {
      try {
        // The Java regex matcher only matches if the whole string is a match, JS RegExp.test matches if the regex is
        // found as a substring. To achieve parity with the Java functionality, we enclose the regex in '^' and '$'.
        if (regexString.indexOf('^') !== 0) {
          regexString = `^${regexString}`;
        }
        if (regexString.indexOf('$') !== regexString.length - 1) {
          regexString += '$';
        }
        regexes.push(new RegExp(regexString));
      } catch (e) {
        logger.warn(
          `Received invalid regex from agent: ${regexString} - this regex will not be used for removing secrets`
        );
      }
    });

    return function isSecret(key) {
      if (key == null || typeof key !== 'string') {
        return false;
      }
      for (let i = 0; i < regexes.length; i++) {
        if (regexes[i].test(key)) {
          return true;
        }
      }
      return false;
    };
  },

  none: function createNoOpMatcher() {
    return function isSecret() {
      return false;
    };
  }
};

/**
 * @param {Array.<string>} configuredSecrets
 * @returns {Array.<string>}
 */
function checkSecrets(configuredSecrets) {
  if (!Array.isArray(configuredSecrets)) {
    return defaultSecrets;
  }
  /** @type {Array.<string>} */
  const secrets = [];
  configuredSecrets.forEach(s => {
    if (typeof s === 'string') {
      secrets.push(s);
    } else {
      logger.warn(`Received invalid secret key from agent: ${s} - this key will not be used for removing secrets`);
    }
  });
  return secrets;
}

/**
 * @param {Array.<string>} configuredSecrets
 */
function toLowerCase(configuredSecrets) {
  if (!Array.isArray(configuredSecrets)) {
    return defaultSecrets;
  }
  /** @type {Array.<string>} */
  const secrets = [];
  configuredSecrets.forEach(s => {
    if (typeof s === 'string') {
      secrets.push(s.toLowerCase());
    } else {
      logger.warn(`Received invalid secret key from agent: ${s} - this key will not be used for removing secrets`);
    }
  });
  return secrets;
}

/** @type {(key: string) => boolean} */
let isSecretInternal;

/**
 * @param {import('./config/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
  isSecretInternal = matchers[config.secrets.matcherMode](config.secrets.keywords);
};

exports.matchers = matchers;

/** @type {(key: string) => boolean} */
exports.isSecret = function isSecret(key) {
  return isSecretInternal(key);
};

/**
 * @param {import('@instana/core/src/config/normalizeConfig').MatchingOption} matcherId
 * @param {Array.<string>} secretsList
 */
exports.setMatcher = function setMatcher(matcherId, secretsList) {
  if (!(typeof matcherId === 'string')) {
    logger.warn(`Received invalid secrets configuration, attribute matcher is not a string: ${matcherId}`);
  } else if (Object.keys(exports.matchers).indexOf(matcherId) < 0) {
    logger.warn(`Received invalid secrets configuration, matcher is not supported: ${matcherId}`);
  } else if (!Array.isArray(secretsList)) {
    logger.warn(`Received invalid secrets configuration, attribute list is not an array: ${secretsList}`);
  } else {
    isSecretInternal = exports.matchers[matcherId](secretsList);
  }
};
