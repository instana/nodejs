/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

/**
 * We currently only instrument CJS modules. As soon as we want
 * to instrument ES modules (such as `got` v12), the requireHook will
 * no longer work. Therefor we would need to wrap the target ES module
 * with our instrumentations using the resolve & load hook.
 *
 * Usage:
 * node --experimental-loader=@instana/collector/esm-loader.mjs server.js
 *
 * NOTE: When using ESM the customer can only configure the collector with
 *       ENV variables.
 */

import instana from './src/index.js';
instana();

/*
export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  return nextLoad(url, context, nextLoad);
}
*/
