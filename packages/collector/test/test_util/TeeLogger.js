/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

/**
 * Multiplexes logs to a collection of target loggers. Think
 * [tee](https://man7.org/linux/man-pages/man1/tee.1.html) but for loggers.
 */
module.exports = class TeeLogger {
  constructor(...targetLoggers) {
    this.targetLoggers = targetLoggers;

    // generate a log method for each log level
    ['debug', 'info', 'warn', 'error'].forEach(method => {
      TeeLogger.prototype[method] = function () {
        this.targetLoggers.forEach(logger => {
          logger[method].apply(logger, arguments);
        });
      };
    });
  }
};
