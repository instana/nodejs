/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

/**
 * IMPORTANT NOTE: From Node.js version 18.19 and above, the ESM loaders operate off-thread.
 * Consequently, ESM instrumentation using '--experimental-loader' becomes obsolete.
 * Instead, we recommend using '--import' for loading instrumentation and relocating the 
 * Instana collector loading to './register' file.
 * Please note that '--import' flag is unavailable in earlier versions, hence we maintain both setups.
 * We will incorporate the native ESM support by using 'import-in-the-middle'.
 *
 * Usage:
 * ENV NODE_OPTIONS='--experimental-loader=/instana/node_modules/
 * @instana/azure-container-services/esm-loader.mjs'
 *
 * NOTE: When using ESM, the customers have the option to set up the azure-container-services
 * by configuring ENV variable within the docker file. Given that azure-container-services
 * self-initializes, its current utilization remains unchanged.
 * However, there's potential for future integration where the init() method
 * can be invoked from this context.
 */

import './src/index.js';

