/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

const semver = require('semver');

module.exports = exports = function supportedVersion(version) {
  return semver.satisfies(version, '^6 || ^7 || ^8.2.1 || ^9.1.0 || ^10.4.0 || ^11 || >=12.0.0');
};
