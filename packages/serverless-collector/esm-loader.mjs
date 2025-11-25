/*
 * (c) Copyright IBM Corp. 2024
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
 * We will incorporate the native ESM support by using 'import-in-the-middle' its register method.
 *
 * Usage:
 * ENV NODE_OPTIONS='--experimental-loader=/instana/node_modules/
 * @instana/serverless-collector/esm-loader.mjs'
 *
 * NOTE: When using ESM, the customers have the option to set up the serverless-collector
 * by configuring ENV variable within the docker file. Given that serverless-collector
 * self-initializes, its current utilization remains unchanged.
 * However, there's potential for future integration where the init() method
 * can be invoked from this context.
 */

import './src/index.js';
