/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const iitmHook = require('./iitmHook');
const requireHook = require('./requireHook');
const isESMApp = require('./esm').isESMApp;

/*
 * RequireHook
 *
 * Provides support for all CommonJS (CJS) modules in CJS applications,
 * Additionally, it extends support to all CommonJS (CJS) modules in ESM applications.
 *
 * Import-in-the-middle
 *
 * Offers support for all native ECMAScript Modules within ESM applications.
 * - Also supports CJS modules within ESM applications.
 * - However, it does not support for modules loaded from CJS applications.
 *
 * Note: In the next major release, we might transition all CJS modules in ESM applications to be
 * supported with iitmHook. For now, this approach is chosen to minimize risk.
 */

/**
 * @param {string} moduleName
 * @param {Function} fn
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.nativeEsm] - Indicates if the module is a native ECMAScript Module
 */
exports.onModuleLoad = (moduleName, fn, { nativeEsm = false } = {}) => {
  // Use requireHook directly if the application is not an ESM app
  if (!isESMApp()) {
    requireHook.onModuleLoad(moduleName, fn);
    return;
  }

  // Use iitmHook if nativeEsm is true, otherwise use requireHook
  if (nativeEsm) {
    iitmHook.onModuleLoad(moduleName, fn);
  } else {
    requireHook.onModuleLoad(moduleName, fn);
  }
};
/**
 * @param {RegExp} pattern
 * @param {Function} fn
 */
exports.onFileLoad = (pattern, fn) => {
  requireHook.onFileLoad(pattern, fn);
};
