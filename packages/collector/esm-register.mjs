/*
 * (c) Copyright IBM Corp. 2024
 */

/**
 * As of Node.js version 18.19 and above, ESM loaders (--experimental-loader)
 * are executed in a dedicated thread, separate from the main thread.
 * see https://github.com/nodejs/node/pull/44710.
 * Previously, loading the Instana collector within the loader and after the update ESM support
 * no longer working with v18.19 and above. To address this, we've opted to load the Instana
 * collector in the main thread using --import. Additionally, we incorporated native ESM
 * support by utilizing the node register method, enabling customization of the ESM loader
 * with 'import-in-the-middle'.
 *
 * Usage:
 * node --import @instana/collector/esm-register.mjs server.js
 */

/**
 * OpenTelemetry Integration correlation
 * 
 * Our OpenTelemetry integration works because we load the IITM hook for ESM here. See https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md.
 * > register('@instana/core/iitm-loader.mjs', import.meta.url);
 * This line adds support for Instana instrumentations and our Otel integration instrumentations working.
 * 
 * Instana pins IITM v3 (via @instana/core). In general, some OTel instrumentation packages still depend on
 * IITM v2. When npm deduplication places an IITM v2 copy at the project root, both versions end up
 * loaded simultaneously: OTel loads v2 from the root, while Instana loads its own v3. Because each
 * IITM instance keeps its own independent hook registry, hooks registered through one instance are
 * invisible to the other. As a result, OTel instrumentations stop working entirely.
 *
 * Instana detects this condition at startup and emits a warning when multiple IITM instances are
 * found in the module cache. See packages/core/src/util/iitmHook.js for the detection logic.
 *
 * Reference: https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md#additional-notes-on-experimental-loaders
 * TODO: Address further cases as described as part of [INSTA-107020](https://jsw.ibm.com/browse/INSTA-107020)
 */

// Import the initialization module for Instana collector and it should be executed in the main thread.
import instana from './src/index.js';
instana();
// ESM module resolution and loading are facilitated by registering `@instana/core/iitm-loader.mjs`, which exports
// import-in-the-middle(IITM) hooks. This registration can be accomplished using the register method from node:module.
// see: https://nodejs.org/api/module.html#customization-hooks
import { register } from 'node:module';
register('@instana/core/iitm-loader.mjs', import.meta.url);
