/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { onModuleLoad: iitmOnModuleLoad } = require('../util/iitmHook');
const { onModuleLoad: requireHookOnModuleLoad } = require('../util/requireHook');

const pureEsmLibraries = ['esm-square-calculator'];

exports.hook = (/** @type {string} */ module, /** @type {Function} */ fn) => {
  requireHookOnModuleLoad('esm-square-calculator', fn);

  if (pureEsmLibraries.includes(module)) {
    iitmOnModuleLoad('esm-square-calculator', fn);
  }
};
