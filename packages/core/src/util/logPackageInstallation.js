/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const isESMApp = require('./esm').isESMApp;

/** @type {import('../logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('util/logPackageInstallation', newLogger => {
  logger = newLogger;
});

exports.logPackageInstallation = function logPackageInstallation() {
  if (process.env.INSTANA_DEBUG || process.env.INSTANA_LOG_LEVEL === 'debug') {
    const instrumentationMap = {
      usingExperimentalLoaderFlag: '--experimental-loader flag',
      usingImport: '--import flag',
      usingRequire: '--require flag',
      noFlags: 'no additional flags'
    };
    let method = '';

    if (isESMApp()) {
      const usingExperimentalLoaderFlag =
        process.env.NODE_OPTIONS?.includes('--experimental-loader')
        || process.execArgv?.[0]?.includes('--experimental-loader')
        ? 'usingExperimentalLoaderFlag' : '';
      const usingImportFlag =
        process.env.NODE_OPTIONS?.includes('--import') || process.execArgv?.[0]?.includes('--import')
        ? 'usingImport' : '';

      method = instrumentationMap[usingExperimentalLoaderFlag || usingImportFlag || 'noFlags'];
    } else {
      const usingRequire =
        (process.env.NODE_OPTIONS?.includes('--require') && process.env.NODE_OPTIONS?.includes('@instana')) ||
        (process.execArgv?.[0]?.includes('--require') && process.execArgv?.[0].includes('@instana')) ||
        (process.execArgv?.[0]?.includes('--require') && process.execArgv?.[1].includes('@instana'))
        ? 'usingRequire' : '';

        method = instrumentationMap[usingRequire || 'noFlags'];
    }

    logger.debug(`The App has instrumented instana using: ${method}`);
  }
  };
