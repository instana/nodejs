/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { satisfies } = require('semver');

/**
 * This function has to be updated from time to time.
 * You can check active versions in https://nodejs.org/en/about/releases/.
 * It's also possible to test the semver match here: https://semver.npmjs.com/
 * @returns {boolean}
 */
exports.isNodeVersionEOL = function () {
  return satisfies(process.versions.node, '<12 || 15 || 13');
};
