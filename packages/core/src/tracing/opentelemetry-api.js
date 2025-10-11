/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * Export the singleton OpenTelemetry API instance from the nearest
 * @opentelemetry installation in node_modules.
 * This guarantees all instrumentations (fs, restify, etc.) use the same API instance,
 * avoiding conflicts between nested or root package versions.
 */
module.exports = require(require.resolve('@opentelemetry/api', {
  paths: [__dirname]
}));
