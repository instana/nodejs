/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

/**
 * IMPORTANT: This file is deprecated, no longer supported, and will be removed in the next major release (v6).
 *
 * IMPORTANT NOTE: From Node.js version 18.19 and above, the ESM loaders operate off-thread.
 * Consequently, ESM instrumentation using '--experimental-loader' becomes deprecated.
 * Instead, we are using '--import' for loading instrumentation and relocated the Instana collector
 * loading to './esm-register' file.
 * Please note that '--import' flag is unavailable in earlier versions, hence we maintain both setups.
 * We will incorporate the native ESM support by using 'import-in-the-middle' ith register method.
 * Usage:
 * node --experimental-loader=@instana/collector/esm-loader.mjs server.js
 *
 * NOTE: When using ESM the customer can only configure the collector with
 *       ENV variables.
 */

import instana from './src/index.js';
instana();
// Here we export all named exports from '@instana/core/iitm-loader.mjs', enabling
// integration of import-in-the-middle (IITM) for Native ESM module support.
export * from '@instana/core/iitm-loader.mjs';
