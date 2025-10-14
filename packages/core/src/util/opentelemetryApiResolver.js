/*
 * (c) Copyright IBM Corp. 2025
 */

// @ts-nocheck

'use strict';

const path = require('path');
const Module = require('module');

/**
 * This helper detects and returns the exact @opentelemetry/api instance
 * that a specific instrumentation is using based on where it's installed.
 *
 * This solves the issue of multiple API instances being loaded in environments
 * such as monorepos, workspaces, or mixed dependency trees.
 */

const apiInstanceCache = new Map();

function resolveApiForInstrumentation(instrumentationName) {
  // Return cached instance if we've already resolved it
  if (apiInstanceCache.has(instrumentationName)) {
    return apiInstanceCache.get(instrumentationName);
  }

  let apiInstance;

  try {
    const instrumentationPath = require.resolve(instrumentationName);
    const instrumentationDir = path.dirname(instrumentationPath);

    try {
      const apiPath = Module._resolveFilename('@opentelemetry/api', {
        id: instrumentationPath,
        filename: instrumentationPath,
        paths: Module._nodeModulePaths(instrumentationDir)
      });

      apiInstance = require(apiPath);
    } catch (err) {
      // Fall back to the root API instance
      apiInstance = require(require.resolve('@opentelemetry/api', { paths: [process.cwd()] }));
    }
  } catch (err) {
    apiInstance = require(require.resolve('@opentelemetry/api', { paths: [process.cwd()] }));
  }

  apiInstanceCache.set(instrumentationName, apiInstance);
  return apiInstance;
}

/**
 * @param {string} instrumentationName - The name of the instrumentation package
 * @returns {object} The API instance
 */
function getApiForInstrumentation(instrumentationName) {
  return resolveApiForInstrumentation(instrumentationName);
}

module.exports = {
  getApiForInstrumentation
};
