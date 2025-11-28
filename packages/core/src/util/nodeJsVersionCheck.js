/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const semver = require('semver');
/**
 * This is the minimum required Node.js version for all @instana packages.
 */
exports.minimumNodeJsVersion = '18.19.0';

/**
 * Checks if the value of process.version denotes a Node.js version that is not supported, that is, older than the given
 * minimum version.
 *
 * @returns {boolean} true, if and only if process.version can be parsed and is older than minimumNodeJsVersion
 */
exports.isNodeJsTooOld = function isNodeJsTooOld() {
  const currentVersion = process.version;
  if (!semver.valid(currentVersion)) {
    return false;
  }

  return semver.lt(currentVersion, exports.minimumNodeJsVersion);
};
