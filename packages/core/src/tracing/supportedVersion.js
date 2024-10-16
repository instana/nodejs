/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const semver = require('semver');

/** @type {(version: string) => boolean} */
module.exports = exports = function supportedVersion(version) {
  const includePrerelease = process.env.NODE_ENV === 'test';
  return semver.satisfies(version, '>=14.0.0', { includePrerelease });
};
