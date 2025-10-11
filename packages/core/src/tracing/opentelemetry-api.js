/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * Provides a deterministic singleton instance of the OpenTelemetry API.
 *
 * Priority:
 * 1. Application root node_modules (so instrumentations installed by the app integrate properly)
 * 2. Fallback to @instana/core's local OTEL API
 *
 * This avoids conflicts when multiple OTEL API versions exist.
 */

/** @type {import('@opentelemetry/api')} */
let apiInstance;

try {
  // Attempt to load OTEL API from application root
  const appRootApiPath = require.resolve('@opentelemetry/api', { paths: [process.cwd()] });
  apiInstance = require(appRootApiPath);
} catch (_) {
  // Fallback to core package OTEL API
  apiInstance = require('@opentelemetry/api');
}

module.exports = apiInstance;
