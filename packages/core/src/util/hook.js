/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const iitmHook = require('./iitmHook');
const requireHook = require('./requireHook');
// eslint-disable-next-line import/no-useless-path-segments
const isESMApp = require('./esm').isESMApp;

/*
 * RequireHook
 *
 * Provides support for all CommonJS (CJS) modules in CJS applications, even if the CJS version of
 * pureEsmLibraries is used in CJS apps.
 * Also, extends support to all CommonJS (CJS) modules in ESM applications.
 */

/*
 * Import-in-the-middle
 *
 * Offers support for all native ECMAScript Modules listed in pureEsmLibraries within ESM applications
 * (including both CJS and ESM versions) of pure ECMAScript Modules.
 * However, it does not provide support for modules loaded from CJS apps.
 */

const pureEsmLibraries = ['square-calc'];
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
