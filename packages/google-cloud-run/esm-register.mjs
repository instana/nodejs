/*
 * (c) Copyright IBM Corp. 2024
 */

/**
 * As of Node.js version 18.19 and above, ESM loaders (--experimental-loader)
 * are executed in a dedicated thread, separate from the main thread.
 * see https://github.com/nodejs/node/pull/44710.
 * Previously, loading the Instana collector within the loader and after the update ESM support
 * no longer working with v18.19 and above. To address this, we've opted to load the Instana
 * collector in the main thread using --import. Additionally, we aim to incorporate native ESM
 * support by utilizing the node register method, enabling customization of the ESM loader
 * with 'import-in-the-middle'.
 *
 * Usage:
 * ENV NODE_OPTIONS='--import /instana/node_modules/@instana/google-cloud-run/esm-register.mjs
 */

// Import the initialization module for google-cloud-run collector; it self-initializes upon import
// and it should be executed in the main thread.
import './src/index.js';

// We plan to utilize this for adding native ESM support in the near future
// import { register } from 'node:module';
// register(./loader.mjs, import.meta.url);
