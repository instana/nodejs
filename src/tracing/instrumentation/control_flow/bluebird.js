'use strict';

var logger = require('../../../logger').getLogger('tracing/bluebird');
var cls = require('../../cls');

exports.activate = function() {
  // nothing to do
};

exports.deactivate = function() {
  // nothing to do
};

exports.init = function() {
  try {
    if (require.resolve('bluebird')) {
      try {
        require('cls-bluebird')(cls.ns);
      } catch (e) {
        logger.warn('Failed to instrument bluebird', e);
      }
    } else {
      // This should actually not happen as require.resolve should either return a resolved filename or throw an
      // exception.
      logger.debug("Won't instrument bluebird as it is not installed (require.resolve returned falsy value).");
    }
  } catch (notResolved) {
    // This happens if bluebird is not available, in which case we do not need
    // to instrument anything, so we can safely ignore the error.
    logger.debug("Won't instrument bluebird as it is not installed.");
  }
};
