/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const isESMApp = require('./esm').isESMApp;

/** @type {import('../logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('util/clientInstrumentationCheck', newLogger => {
  logger = newLogger;
});

exports.clientInstrumentationInfo = function clientInstrumentationInfo() {
    const instrumentationMap = {
      usingExperimentalLoaderFlag: '--experimental-loader flag',
      usingImport: '--import flag',
      usingRequire: '--require flag',
      noFlags: 'no additional flags'
    };
    let method = '';
    let appType = '';

    if (isESMApp()) {
      const usingExperimentalLoaderFlag =
        process.env.NODE_OPTIONS?.includes('--experimental-loader')
        || process.execArgv?.[0]?.includes('--experimental-loader')
        ? 'usingExperimentalLoaderFlag' : '';
      const usingImportFlag =
        process.env.NODE_OPTIONS?.includes('--import') || process.execArgv?.[0]?.includes('--import')
        ? 'usingImport' : '';

      appType = 'ESM';
      method = instrumentationMap[usingExperimentalLoaderFlag || usingImportFlag || 'noFlags'];
    } else {
      const usingRequire =
        (process.env.NODE_OPTIONS?.includes('--require') && process.env.NODE_OPTIONS?.includes('@instana')) ||
        (process.execArgv?.[0]?.includes('--require') && process.execArgv?.[0].includes('@instana')) ||
        (process.execArgv?.[0]?.includes('--require') && process.execArgv?.[1].includes('@instana'))
        ? 'usingRequire' : '';

        appType = 'non ESM(common)';
        method = instrumentationMap[usingRequire || 'noFlags'];
    }

    logger.debug(`The ${appType} App has instrumented instana using: ${method}`);
  };
