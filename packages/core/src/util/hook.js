/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const iitmHook = require('./iitmHook');
const requireHook = require('./requireHook');
const isESMApp = require('./esm').isESMApp;

/*
 * pureEsmLibraries
 *
 * This array lists all the libraries that are native ECMAScript Modules.
 */
const pureEsmLibraries = ['square-calc'];
/*
 * RequireHook
 *
 * Provides support for all CommonJS (CJS) modules in CJS applications,
 * even if the CJS version of libraries listed in "pureEsmLibraries" is used.
 * Additionally, it extends support to all CommonJS (CJS) modules in ESM applications.
 *
 * Import-in-the-middle
 *
 * Offers support for all native ECMAScript Modules listed in "pureEsmLibraries" within ESM applications.
 * However, it does not provide support for modules loaded from CJS applications.
 *
 * Note: In the next major release (4.x), we plan to transition all CJS modules in ESM applications to be
 * supported with iitmHook. For now, this approach is chosen to minimize risk.
 */

/**
 * @param {string} moduleName
 * @param {Function} fn
 */
exports.onModuleLoad = (moduleName, fn) => {
  if (pureEsmLibraries.includes(moduleName) && isESMApp()) {
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
