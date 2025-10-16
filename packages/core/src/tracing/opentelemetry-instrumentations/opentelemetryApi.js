/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * Exports the singleton OpenTelemetry API instance from the root-level
 * @opentelemetry installation in node_modules.
 *
 * This ensures that all instrumentations share the same API instance,
 * preventing conflicts that can occur when multiple versions (root vs nested)
 * are loaded within the same process.
 */
module.exports = require(require.resolve('@opentelemetry/api', { paths: [process.cwd()] }));
