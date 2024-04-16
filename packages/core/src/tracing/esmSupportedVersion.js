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
  // Reference: https://nodejs.org/en/blog/release/v18.19.0#esm-and-customization-hook-changes
  // Node.js v18.19 and above the loaders are off threaded
  // https://instana.slack.com/archives/G0118PFNN20/p1708556683665099
  return semver.gte(version, '18.19.0');
};

/**
 * Check if the experimental loader flag is enabled and if the current Node.js version supports it.
 * @returns {boolean} - True if the experimental loader is enabled and supported, false otherwise.
 * Node.js v18.19 and above we are not supporting --experimental-loader flag
 */
exports.hasExperimentalLoaderFlag = function hasExperimentalLoaderFlag() {
  const experimentalLoaderFlagIsSet =
    (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes('--experimental-loader')) ||
    (process.execArgv[0] && process.execArgv[0].includes('--experimental-loader'));

  return experimentalLoaderFlagIsSet && exports.isLatestEsmSupportedVersion(process.versions.node);
};
