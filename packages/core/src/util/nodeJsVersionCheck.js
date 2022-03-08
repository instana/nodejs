/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

/**
 * This is the minimum required Node.js version for all @instana packages.
 */
exports.minimumNodeJsVersion = 10;

/**
 * Checks if the value of process.version denotes a Node.js version that is not supported, that is, older than the given
 * minimum version.
 *
 * @param {number} minimumNodeJsVersion
 * @returns {boolean} true, if and only if process.version can be parsed and is older than minimumNodeJsVersion
 */
exports.isNodeJsTooOld = function isNodeJsTooOld(minimumNodeJsVersion = exports.minimumNodeJsVersion) {
  const currentVersion = process.version;
  if (typeof currentVersion === 'string') {
    const majorVersionStr = process.version.split('.')[0];
    if (majorVersionStr.length > 1 && majorVersionStr.charAt(0) === 'v') {
      const majorVersion = parseInt(majorVersionStr.substring(1), 10);
      return !isNaN(majorVersion) && majorVersion < minimumNodeJsVersion;
    }
  }
  return false;
};
