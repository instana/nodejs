/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const iitmHook = require('import-in-the-middle');

/** @type {import('../instanaCtr').InstanaCtrType} */
let instanaCtr;

/** @type {Object.<string, Function[]>} */
const byModuleNameTransformers = {};

/**
 * @param {import('../instanaCtr').InstanaCtrType} _instanaCtr
 */
exports.init = function init(_instanaCtr) {
  instanaCtr = _instanaCtr;
};

/**
 * Initializes the import-in-the-middle hooking.
 */
exports.activate = function activate() {
  Object.entries(byModuleNameTransformers).forEach(([moduleName, applicableTransformers]) => {
    if (applicableTransformers) {
      applicableTransformers.forEach(transformerFn => {
        if (typeof transformerFn === 'function') {
          // @ts-ignore
          iitmHook([moduleName], (exports, name) => {
            instanaCtr.logger().debug(`iitm-hooking enabled for module ${name}`);
            if (exports && exports.default) {
              exports.default = transformerFn(exports.default);
            } else {
              return transformerFn(exports);
            }
            return exports;
          });
        } else {
          instanaCtr
            .logger()
            .error(
              `The transformer is not a function but of type "${typeof transformerFn}" (details: ${
                transformerFn == null ? 'null/undefined' : transformerFn
              }).`
            );
        }
      });
    }
  });
};

/**
 * @param {string} moduleName - The name of the module.
 * @param {Function} transformFn - The transformer function.
 */
exports.onModuleLoad = function onModuleLoad(moduleName, transformFn) {
  byModuleNameTransformers[moduleName] = byModuleNameTransformers[moduleName] || [];
  byModuleNameTransformers[moduleName].push(transformFn);
};
