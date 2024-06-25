/*
 * (c) Copyright IBM Corp. 2024
 */

/**
 * As of Node.js version 18.19 and above, ESM loaders (--experimental-loader)
 * are executed in a dedicated thread, separate from the main thread.
 * see https://github.com/nodejs/node/pull/44710.
 * Previously, loading the Instana collector within the loader and after the update ESM support
 * no longer working with v18.19 and above. To address this, we've opted to load the Instana
 * collector in the main thread using --import.
 * Additionally, we incorporated native ESM support by utilizing the node register method,
 * enabling customization of the ESM loader with 'import-in-the-middle'.
 *
 * Usage:
 *  ENV NODE_OPTIONS='--import /instana/node_modules/@instana/aws-fargate/esm-register.mjs
 */

// Import the initialization module for aws-fargate collector; it self-initializes upon import
// and it should be executed in the main thread.
import './src/index.js';
import { register } from 'node:module';
// ESM module resolution and loading are facilitated by registering `@instana/core/iitm-loader.mjs`, which exports
// import-in-the-middle(IITM) hooks. This registration can be accomplished using the register method from node:module.
// see: https://nodejs.org/api/module.html#customization-hooks
register('@instana/core/iitm-loader.mjs', import.meta.url);