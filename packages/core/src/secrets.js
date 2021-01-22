/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2018
 */

'use strict';

let logger;
logger = require('./logger').getLogger('secrets', newLogger => {
  logger = newLogger;
});

const defaultMatcherMode = 'contains-ignore-case';
const defaultSecrets = ['key', 'pass', 'secret'];

exports.matchers = {
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

  regex: function createRegexMatcher(secrets) {
    secrets = checkSecrets(secrets);
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

function checkSecrets(configuredSecrets) {
  if (!Array.isArray(configuredSecrets)) {
    return defaultSecrets;
  }
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

function toLowerCase(configuredSecrets) {
  if (!Array.isArray(configuredSecrets)) {
    return defaultSecrets;
  }
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

exports.isSecret = exports.matchers[defaultMatcherMode](defaultSecrets);

exports.init = function init(config) {
  // Init from config/env vars. Might be overwritten from agent response later (via setMatcher);
  exports.isSecret = exports.matchers[config.secrets.matcherMode](config.secrets.keywords);
};

exports.setMatcher = function setMatcher(matcherId, secretsList) {
  if (!(typeof matcherId === 'string')) {
    logger.warn('Received invalid secrets configuration, attribute matcher is not a string: $s', matcherId);
  } else if (Object.keys(exports.matchers).indexOf(matcherId) < 0) {
    logger.warn('Received invalid secrets configuration, matcher is not supported: $s', matcherId);
  } else if (!Array.isArray(secretsList)) {
    logger.warn('Received invalid secrets configuration, attribute list is not an array: $s', secretsList);
  } else {
    exports.isSecret = exports.matchers[matcherId](secretsList);
  }
};
