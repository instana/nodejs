/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { format } = require('util');

/**
 * A logger that does not emit logs anywhere but collects them. Useful for validating what has been logged in tests.
 */
module.exports = class CollectingLogger {
  constructor() {
    this.collectedLogs = {
      debug: [],
      info: [],
      warn: [],
      error: []
    };

    // generate a log method for each log level
    ['debug', 'info', 'warn', 'error'].forEach(method => {
      CollectingLogger.prototype[method] = function () {
        if (arguments.length === 1) {
          this.collectedLogs[method].push(arguments[0]);
        } else if (arguments.length > 1) {
          this.collectedLogs[method].push(format(...arguments));
        }
      };
    });
  }

  getCollectedLogs() {
    return this.collectedLogs;
  }

  getDebugLogs() {
    return this.collectedLogs.debug;
  }

  getInfoLogs() {
    return this.collectedLogs.info;
  }

  getWarnLogs() {
    return this.collectedLogs.warn;
  }

  getErrorLogs() {
    return this.collectedLogs.error;
  }
};
