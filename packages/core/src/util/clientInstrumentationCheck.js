/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

exports.tracerInstrumentationInfo = function tracerInstrumentationInfo() {
    const instrumentationMap = {
      usingExperimentalLoaderFlag: '--experimental-loader flag',
      usingImport: '--import flag',
      usingRequire: '--require flag',
      noFlags: 'no additional flags'
    };

    const usingExperimentalLoaderFlag =
      (process.env.NODE_OPTIONS?.includes('--experimental-loader')) ||
      (process.execArgv?.[0]?.includes('--experimental-loader'))
      ? 'usingExperimentalLoaderFlag' : '';

    const usingImport =
      (process.env.NODE_OPTIONS?.includes('--import') && process.env.NODE_OPTIONS?.includes('@instana/collector')) ||
      (process.execArgv?.[0]?.includes('--import') && process.execArgv?.[0].includes('@instana/collector')) ||
      (process.execArgv?.[0]?.includes('--import') && process.execArgv?.[1].includes('@instana/collector'))
      ? 'usingImport' : '';

    const usingRequire =
      (process.env.NODE_OPTIONS?.includes('--require') && process.env.NODE_OPTIONS?.includes('@instana/collector')) ||
      (process.execArgv?.[0]?.includes('--require') && process.execArgv?.[0].includes('@instana/collector')) ||
      (process.execArgv?.[0]?.includes('--require') && process.execArgv?.[1].includes('@instana/collector'))
      ? 'usingRequire' : '';

    return instrumentationMap[usingExperimentalLoaderFlag || usingImport || usingRequire || 'noFlags'];
  };
