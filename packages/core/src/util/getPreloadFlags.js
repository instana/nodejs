/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

exports.getPreloadFlags = function getPreloadFlags() {
  if (
    process.env.NODE_OPTIONS?.includes('--require')
    || process.env.NODE_OPTIONS?.includes('--import')
    || process.env.NODE_OPTIONS?.includes('--experimental-loader')) {
      return process.env.NODE_OPTIONS;
  } else if (process.execArgv.length > 0) {
    const result = process.execArgv.find(arg =>
      arg.includes('--require') || arg.includes('--import') || arg.includes('--experimental-loader')
    );
    return result || 'noFlags';
  } else {
    return 'noFlags';
  }
};
