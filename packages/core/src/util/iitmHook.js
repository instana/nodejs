/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const iitmHook = require('import-in-the-middle');

/** @type {import('../logger').GenericLogger} */
let logger = require('../logger').getLogger('util/iitmHook', newLogger => {
  logger = newLogger;
});

/** @type {Object.<string, *>} */
const byModuleNameTransformers = {};

exports.init = function init() {
// eslint-disable-next-line no-restricted-syntax
  for (const [moduleName, applicableTransformers] of Object.entries(byModuleNameTransformers)) {
    if (applicableTransformers) {
      for (let i = 0; i < applicableTransformers.length; i++) {
        const transformerFn = applicableTransformers[i];
        if (typeof transformerFn === 'function') {
          try {
            // @ts-ignore
            // eslint-disable-next-line no-loop-func
            iitmHook([moduleName], (exports, name, basedir) => {
              logger.info(`Hooking enabled for module ${name} in base directory ${basedir}`);
              if (exports && exports.default) {
                exports.default = transformerFn(exports.default);
                return exports;
              } else {
                return transformerFn(exports);
              }
            });
          } catch (e) {
            logger.error(`Cannot instrument ${moduleName} due to an error in instrumentation: ${e}`);
            if (e.message) {
              logger.error(e.message);
            }
            if (e.stack) {
              logger.error(e.stack);
            }
          }
        } else {
          logger.error(
            `The transformer is not a function but of type "${typeof transformerFn}" (details: ${
              transformerFn == null ? 'null/undefined' : transformerFn
              // eslint-disable-next-line no-useless-concat
            }). ` + "The most likely cause is that something has messed with Node.js' module cache."
          );
        }
      }
    }
  }
};

/**
 * Add a transformer function for a specific module.
 * @param {string} moduleName
 * @param {Function} transfornFn
 */
exports.onModuleLoad = function onModuleLoad(moduleName, transfornFn) {
  byModuleNameTransformers[moduleName] = byModuleNameTransformers[moduleName] || [];
  byModuleNameTransformers[moduleName].push(transfornFn);
};
