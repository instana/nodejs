/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { onModuleLoad: iitmOnModuleLoad } = require('../util/iitmHook');
const { onModuleLoad: requireHookOnModuleLoad } = require('../util/requireHook');

const pureEsmLibraries = ['square-calc'];

exports.onModuleLoad = (/** @type {string} */ module, /** @type {Function} */ fn, /** @type {boolean} */ esmAPP) => {
  if (pureEsmLibraries.includes(module) && esmAPP) {
    iitmOnModuleLoad(module, fn);
  } else {
    requireHookOnModuleLoad(module, fn);
  }
};
