/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * Exports the singleton OpenTelemetry API instance from the root-level
 * @opentelemetry installation in node_modules.
 *
 * Resolution Logic:
 *   1. Attempt to resolve @opentelemetry/api from the current working directory (root-level).
 *   2. If not found, fall back to a nested (child) installation of @opentelemetry/api.
 *
 * This ensures that all instrumentations share the same API instance when possible,
 * avoiding conflicts that can arise when multiple versions (root vs nested)
 * are loaded within the same process.
 *
* Example structure:
 * ├── node_modules/@opentelemetry/api/      # root (preferred)
 * └── packages/service/node_modules/@opentelemetry/api/  # fallback
 */
let api;

try {
  api = require(require.resolve('@opentelemetry/api', { paths: [process.cwd()] }));
} catch {
  api = require('@opentelemetry/api');
}

module.exports = api;
