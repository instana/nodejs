/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

/**
 * Check if the experimental loader flag is enabled and if the current Node.js version supports it.
 * @returns {boolean} - True if the experimental loader is enabled and supported, false otherwise.
 * Node.js v18.19 and above we are not supporting --experimental-loader flag
 */
exports.hasExperimentalLoaderFlag = function hasExperimentalLoaderFlag() {
  return !!(
    (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes('--experimental-loader')) ||
    (process.execArgv[0] && process.execArgv[0].includes('--experimental-loader'))
  );
};

/**
 * Check if esm-loader.mjs is being used.
 * @returns {boolean} - True if esm-loader.mjs is present in Node options or execArgv, false otherwise.
 */
exports.hasEsmLoaderFile = function hasEsmLoaderFile() {
  return !!(
    (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes('esm-loader.mjs')) ||
    process.execArgv.some(arg => arg.includes('esm-loader.mjs'))
  );
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
