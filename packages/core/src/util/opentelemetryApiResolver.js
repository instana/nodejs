/*
 * (c) Copyright IBM Corp. 2025
 */

// @ts-nocheck

'use strict';

const path = require('path');
const Module = require('module');

/**
 * Resolves the exact @opentelemetry/api instance used by a given instrumentation.
 *
 * This avoids issues where multiple API instances exist in environments such as
 * monorepos, layered dependency trees, or workspace setups — ensuring the
 * instrumentation and tracer share the same API reference.
 *
 *
 * @param {string} instrumentationName - Name of the instrumentation package
 * @returns {object} The resolved OpenTelemetry API instance
 */
function resolveApiForInstrumentation(instrumentationName) {
  let apiInstance;

  try {
    const instrumentationPath = require.resolve(instrumentationName);
    const instrumentationDir = path.dirname(instrumentationPath);

    try {
      // Resolve the @opentelemetry/api path relative to the instrumentation path
      const apiPath = Module._resolveFilename('@opentelemetry/api', {
        id: instrumentationPath,
        filename: instrumentationPath,
        paths: Module._nodeModulePaths(instrumentationDir)
      });

      apiInstance = require(apiPath);
    } catch {
      // Fallback: use the root-level API if not found within the instrumentation
      apiInstance = require(require.resolve('@opentelemetry/api', { paths: [process.cwd()] }));
    }
  } catch {
    // Final fallback: attempt global/root-level resolution
    apiInstance = require(require.resolve('@opentelemetry/api', { paths: [process.cwd()] }));
  }

  return apiInstance;
}

/**
 * Returns the OpenTelemetry API instance for a given instrumentation.
 * Caches results to avoid repeated resolution overhead.
 */
function getApiForInstrumentation(instrumentationName) {
  return resolveApiForInstrumentation(instrumentationName);
}

module.exports = { getApiForInstrumentation };
