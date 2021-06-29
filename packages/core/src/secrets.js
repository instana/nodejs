/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

/** @type {import('./logger').GenericLogger} */
let logger;
logger = require('./logger').getLogger('secrets', newLogger => {
  logger = newLogger;
});

const defaultMatcherMode = 'contains-ignore-case';
const defaultSecrets = ['key', 'pass', 'secret'];

/**
 * @typedef {Object} SecretMatchers
 * @property {(secrets: Array.<string>) => (key: string) => boolean} equals-ignore-case
 * @property {(secrets: Array.<string>) => (key: string) => boolean} equals
 * @property {(secrets: Array.<string>) => (key: string) => boolean} contains-ignore-case
 * @property {(secrets: Array.<string>) => (key: string) => boolean} contains
 * @property {(secrets: Array.<string>) => (key: string) => boolean} regex
 * @property {() => () => boolean} none
 */

/** @type {SecretMatchers} */
exports.matchers = {
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
          'Received invalid regex from agent: %s - this regex will not be used for removing secrets',
          regexString
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

/** @type {(key: string) => boolean} */
let isSecretInternal = exports.matchers[defaultMatcherMode](defaultSecrets);

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
      logger.warn('Received invalid secret key from agent: %s - this key will not be used for removing secrets', s);
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
      logger.warn('Received invalid secret key from agent: %s - this key will not be used for removing secrets', s);
    }
  });
  return secrets;
}

/**
 * @typedef {'contains' | 'equals-ignore-case' | 'equals' | 'contains-ignore-case' | 'regex'} MatchingOptions
 */

/** @type {(key: string) => boolean} */
exports.isSecret = function isSecret(key) {
  return isSecretInternal(key);
};

/**
 * @typedef {Object} Secrets
 * @property {*} keywords
 * @property {MatchingOptions} matcherMode
 */

/**
 * @typedef {Object} SecretOption
 * @property {Secrets} secrets
 */

/**
 * @param {SecretOption} config
 */
exports.init = function init(config) {
  isSecretInternal = exports.matchers[config.secrets.matcherMode](config.secrets.keywords);
};

/**
 * @param {MatchingOptions} matcherId
 * @param {Array.<*>} secretsList
 */
exports.setMatcher = function setMatcher(matcherId, secretsList) {
  if (!(typeof matcherId === 'string')) {
    logger.warn('Received invalid secrets configuration, attribute matcher is not a string: $s', matcherId);
  } else if (Object.keys(exports.matchers).indexOf(matcherId) < 0) {
    logger.warn('Received invalid secrets configuration, matcher is not supported: $s', matcherId);
  } else if (!Array.isArray(secretsList)) {
    logger.warn('Received invalid secrets configuration, attribute list is not an array: $s', secretsList);
  } else {
    isSecretInternal = exports.matchers[matcherId](secretsList);
  }
};
