/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * We load a specific @opentelemetry/api version.
 * It hooks into Node’s module resolver and redirects any import
 * of "@opentelemetry/api" to the version set in OTEL_API_VERSION
 * (for example, "v190" or "v130").
 */
if (process.env.OTEL_API_VERSION) {
  const version = process.env.OTEL_API_VERSION;
  const alias = `@opentelemetry/api-${version}`;
  const resolved = require.resolve(alias);

  const Module = require('module');
  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === '@opentelemetry/api') {
      return resolved;
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}
