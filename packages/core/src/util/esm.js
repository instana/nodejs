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

/**
 * Checks if the application is an ECMAScript Modules (ESM) app by inspecting
 * the presence of flags like --experimental-loader and --import in the environment.
 * @returns {boolean} True if an ESM app is detected, false otherwise.
If the application is ESM, caching the result for efficiency.
 * @type {boolean}
 */
let isESMCached = null;
exports.isESMApp = function isESMApp() {
  if (isESMCached !== null) {
    return isESMCached;
  }
  const isESM =
    (process.env.NODE_OPTIONS &&
      (process.env.NODE_OPTIONS.includes('--experimental-loader') || process.env.NODE_OPTIONS.includes('--import'))) ||
    (process.execArgv &&
      process.execArgv.length > 0 &&
      ((process.execArgv[0].includes('--experimental-loader') && process.execArgv[0].includes('esm-loader.mjs')) ||
        (process.execArgv[0].includes('--experimental-loader') && process.execArgv[1]?.includes('esm-loader.mjs')) ||
        (process.execArgv[0].includes('--import') && process.execArgv[0].includes('esm-register.mjs')) ||
        (process.execArgv[0].includes('--import') && process.execArgv[1]?.includes('esm-register.mjs'))));

  isESMCached = isESM;

  return isESM;
};

exports.tracerInstrumentationInfo = function tracerInstrumentationInfo() {
  const objMap = {
    usingExperimentalLoaderFlag: '--experimental-loader',
    usingImport: '--import',
    usingRequire: '--require'
  };
  const usingExperimentalLoaderFlag =
    (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes('--experimental-loader')) ||
    (process.execArgv[0] && process.execArgv[0].includes('--experimental-loader'))
    ? 'usingExperimentalLoaderFlag' : '';

  const usingImport =
    (process.execArgv &&
      process.execArgv.length > 0 &&
      process.execArgv[0].includes('--import') && process.execArgv[0].includes('esm-register.mjs')) ||
    (process.execArgv &&
      process.execArgv.length > 0 &&
      process.execArgv[0].includes('--import') && process.execArgv[1]?.includes('esm-register.mjs'))
    ? 'usingImport' : '';

  const usingRequire = (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes('--require')) ||
  (process.execArgv[0] && process.execArgv[0].includes('--require')) ? 'usingRequire' : '';

  // @ts-ignore
  return objMap[usingExperimentalLoaderFlag || usingImport || usingRequire || 'default'];
};
