/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');

describe('[UNIT] serverless/logger ', function () {
  it('throws a RangeError when you init with its own instance', function (cb) {
    const loggerModule = require(path.resolve(__dirname, '..', 'src', 'logger.js'));
    const instLogger = loggerModule.init();
    loggerModule.init({ logger: instLogger });

    try {
      instLogger.info('Logging with the same logger instance.');
      cb();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('Error:', e.message);
      cb(new Error('Received a RangeError'));
    }
  });
});
