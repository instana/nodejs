/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const semver = require('semver');

/** @type {(version: string) => boolean} */
module.exports = exports = function esmSupportedVersion(version) {
  return semver.satisfies(version, '>=14.0.0 <20.0.0');
};
