/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const semver = require('semver');

/** @type {(version: string) => boolean} */
module.exports = exports = function esmSupportedVersion(version) {
  // https://github.com/nodejs/node/pull/44710
  return semver.satisfies(version, '>=14.0.0 <18.19');
};
