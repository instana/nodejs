/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { onModuleLoad: iitmOnModuleLoad } = require('../util/iitmHook');
const requireHook = require('../util/requireHook');

const pureEsmLibraries = ['square-calc'];

exports.hook = (/** @type {string} */ module, /** @type {Function} */ fn) => {
  requireHook.onModuleLoad(module, fn);

  if (pureEsmLibraries.includes(module)) {
    iitmOnModuleLoad(module, fn);
  }
};
