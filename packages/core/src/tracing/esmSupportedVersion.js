/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const semver = require('semver');

/**
 * Check if the given Node.js version supports ESM.
 * @param {string} version - The Node.js version to check.
 * @returns {boolean} - True if ESM is supported, false otherwise.
 */
exports.esmSupportedVersion = function esmSupportedVersion(version) {
  return semver.gte(version, '14.0.0');
};

/**
 * Check if the given Node.js version is the latest version that supports ESM.
 * @param {string} version - The Node.js version to check.
 * @returns {boolean} - True if the version is the latest that supports ESM, false otherwise.
 */
exports.isLatestEsmSupportedVersion = function isLatestEsmSupportedVersion(version) {
  // Reference: https://github.com/nodejs/node/pull/44710
  return semver.gte(version, '18.19.0');
};
