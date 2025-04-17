/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const semver = require('semver');
const { minimumNodeJsVersion } = require('../util/nodeJsVersionCheck');

/** @type {(version: string) => boolean} */
module.exports = exports = function supportedVersion(version) {
  const includePrerelease = process.env.NODE_ENV === 'test';
  return semver.satisfies(version, `>=${minimumNodeJsVersion}`, { includePrerelease });
};
