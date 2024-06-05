/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { onModuleLoad: iitmOnModuleLoad } = require('../util/iitmHook');
const { onModuleLoad: requireHookOnModuleLoad } = require('../util/requireHook');

const pureEsmLibraries = ['square-calc'];

exports.onModuleLoad = (/** @type {string} */ module, /** @type {Function} */ fn) => {
  requireHookOnModuleLoad(module, fn);

  if (pureEsmLibraries.includes(module)) {
    iitmOnModuleLoad(module, fn);
  }
};
