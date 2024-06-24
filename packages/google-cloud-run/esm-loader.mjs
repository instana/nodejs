/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

/**
 * IMPORTANT NOTE: From Node.js version 18.19 and above, the ESM loaders operate off-thread.
 * Consequently, ESM instrumentation using '--experimental-loader' becomes deprecated.
 * Instead, we are using '--import' for loading instrumentation and relocated the Instana collector
 * loading to './esm-register' file.
 * Please note that '--import' flag is unavailable in earlier versions, hence we maintain both setups.
 * We will incorporate the native ESM support by using 'import-in-the-middle' ith register method.
 *
 * Usage:
 * ENV NODE_OPTIONS='--experimental-loader=/instana/node_modules/
 * @instana/google-cloud-run/esm-loader.mjs'
 *
 * NOTE: When using ESM, the customers have the option to set up the google-cloud-run
 * by configuring ENV variable within the docker file. Given that google-cloud-run
 * self-initializes, its current utilization remains unchanged.
 * However, there's potential for future integration where the init() method
 * can be invoked from this context.
 */

import './src/index.js';
// Here we export all named exports from '@instana/core/iitm-loader.mjs', enabling
// integration of import-in-the-middle (IITM) for Native ESM module support.
export * from '@instana/core/iitm-loader.mjs';
