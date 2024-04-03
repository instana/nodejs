/*
 * (c) Copyright IBM Corp. 2022
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
 * node --experimental-loader=@instana/collector/esm-loader.mjs server.js
 *
 * NOTE: When using ESM the customer can only configure the collector with
 *       ENV variables.
 */

import instana from './src/index.js';
instana();
