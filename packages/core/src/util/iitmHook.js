/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const iitmHook = require('import-in-the-middle');

/** @type {import('../core').GenericLogger} */
let logger;

/** @type {Object.<string, Function[]>} */
const byModuleNameTransformers = {};

/**
 * Scans require.cache for distinct copies of import-in-the-middle's hook registry.
 * Each copy represents a separate IITM instance with its own independent hook list,
 * meaning hooks registered through one instance are invisible to the others.
 *
 * @returns {string[]} Absolute paths to every distinct lib/register.js found in the cache.
 */
function findAllIitmRegisterPaths() {
  // 'lib/register.js' is IITM's shared hook registry - one per instance.
  const registrySuffix = path.join('import-in-the-middle', 'lib', 'register.js');
  return Object.keys(require.cache).filter(cachedPath => cachedPath.endsWith(registrySuffix));
}

/**
 * @param {import('../config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

/**
 * Registers IITM hooks for all queued module transformers, then checks for conflicting
 * IITM instances. The conflict check runs after all instrumentations (including OTel ones)
 * have been initialised so that any third-party IITM copy is already in require.cache.
 */
exports.activate = function activate() {
  const iitmInstances = findAllIitmRegisterPaths();
  if (iitmInstances.length > 1) {
    logger.debug(
      '[Instana] Multiple import-in-the-middle (IITM) instances detected in the module cache. ' +
        'This typically happens when different packages depend on incompatible IITM versions ' +
        'and npm deduplication places both on disk. ' +
        'Each instance maintains its own hook registry, so hooks registered through one instance ' +
        'will not fire when another instance dispatches module load events — ' +
        'OpenTelemetry instrumentations are likely broken. ' +
        'To fix this, align all IITM dependencies to the same version. ' +
        `Detected instances:\n${iitmInstances.map(p => `  - ${p}`).join('\n')}`
    );
  }

  Object.entries(byModuleNameTransformers).forEach(([moduleName, applicableTransformers]) => {
    if (applicableTransformers) {
      applicableTransformers.forEach(transformerFn => {
        if (typeof transformerFn === 'function') {
          // @ts-ignore
          iitmHook([moduleName], (exports, name) => {
            logger.debug(`iitm-hooking enabled for module ${name}`);
            if (exports && exports.default) {
              exports.default = transformerFn(exports.default);
            } else {
              return transformerFn(exports);
            }
            return exports;
          });
        } else {
          logger.error(
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
