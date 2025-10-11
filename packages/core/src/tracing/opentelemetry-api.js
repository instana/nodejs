/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

/**
 * This module ensures that we always use the same instance of the OpenTelemetry API
 * throughout the application, even when there are multiple installations in a nested
 * package structure.
 *
 * The issue occurs when:
 * 1. @instana/core has its own OTEL API instance
 * 2. The application has a different OTEL API instance at the root
 * 3. Instrumentations (like fs) are initialized with the core OTEL API instance
 * 4. But the app uses the root API instance
 *
 * This wrapper ensures all code uses the same API instance.
 */

// Store the singleton instance
/** @type {import('@opentelemetry/api')} */
let apiInstance;

// Export a function that returns the singleton instance
/**
 * Returns the singleton instance of the OpenTelemetry API
 * @returns {import('@opentelemetry/api')} The OpenTelemetry API instance
 */
module.exports = function getOpenTelemetryApi() {
  if (!apiInstance) {
    const path = require('path');
    const possiblePaths = [
      // Try application root first
      path.resolve(process.cwd(), 'node_modules/@opentelemetry/api'),
      // Try monorepo root
      path.resolve(process.cwd(), '../../node_modules/@opentelemetry/api'),
      // Try parent directory (for nested packages)
      path.resolve(process.cwd(), '../node_modules/@opentelemetry/api')
    ];

    // Try each path in order
    let i = 0;
    while (!apiInstance && i < possiblePaths.length) {
      try {
        apiInstance = require(possiblePaths[i]);
        // Successfully loaded
      } catch (e) {
        // Continue to next path
      }
      i += 1;
    }

    // If not found in any of the paths, fall back to the local installation
    if (!apiInstance) {
      apiInstance = require('@opentelemetry/api');
    }
  }
  return apiInstance;
};
