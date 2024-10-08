/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const semver = require('semver');

/** @type {(version: string) => boolean} */
module.exports = exports = function supportedVersion(version) {
  const baseVersion = version?.split('-')[0];

  return semver.satisfies(baseVersion, '>=14.0.0');
};
