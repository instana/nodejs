/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

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
  if (typeof currentVersion === 'string') {
    const parts = currentVersion.split('.');
    const majorVersionStr = parts[0];
    if (majorVersionStr.length > 1 && majorVersionStr.charAt(0) === 'v') {
      const major = parseInt(majorVersionStr.slice(1), 10);
      const minor = parseInt(parts[1], 10);
      const patch = parseInt(parts[2], 10);

      if (isNaN(major) || isNaN(minor) || isNaN(patch)) return false;

      const [minMajor, minMinor, minPatch] = exports.minimumNodeJsVersion.split('.').map(Number);
      return (
        major < minMajor ||
        (major === minMajor && minor < minMinor) ||
        (major === minMajor && minor === minMinor && patch < minPatch)
      );
    }
  }
  return false;
};
