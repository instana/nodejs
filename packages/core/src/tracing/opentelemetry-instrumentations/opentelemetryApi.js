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
 * Note:
 * In practice, the fallback case is not currently known to occur — we’ve kept it
 * as a safety measure in case of future structural changes or unusual setups.
 *
 * Version Compatibility:
 *   - Supported versions: 1.3.0 ≤ v < 1.10.0 (see core/package.json)
 *   - If an unsupported version is installed at the root, the system will
 *     install the highest compatible version from this range in the core node_modules.
 *   - However, tracing will not function correctly in such cases because
 *     multiple API instances (root vs child) may exist simultaneously.
 *
 *   Tracing only works when a supported @opentelemetry/api version
 *   (within the specified range in this package’s dependencies) is installed at the root.
 */

let api;

try {
  api = require(require.resolve('@opentelemetry/api', { paths: [process.cwd()] }));
} catch {
  api = require('@opentelemetry/api');
}

module.exports = api;
