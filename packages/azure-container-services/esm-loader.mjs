/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

/**
 * We currently only instrument CJS modules. As soon as we want
 * to instrument ES modules (such as `got` v12), the requireHook will
 * no longer work. Therefor we would need to wrap the target ES module
 * with our instrumentations using the resolve & load hook.
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
/*
export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  return nextLoad(url, context, nextLoad);
}
*/
