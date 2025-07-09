/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { satisfies } = require('semver');

/**
 * This function has to be updated from time to time.
 * You can check active versions in https://nodejs.org/en/about/releases/.
 *
 * @returns {boolean}
 */
exports.isNodeVersionEOL = function () {
  return satisfies(process.versions.node, '<20 || 21 || 23');
};
