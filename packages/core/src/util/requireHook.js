/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const Module = require('module');
const path = require('path');

/**
 * @typedef {Object} FileNamePatternTransformer
 * @property {Function} fn
 * @property {RegExp} pattern
 */

/**
 * @typedef {Object} ExecutedHook
 * @property {*} originalModuleExports
 * @property {*} moduleExports
 * @property {Array<string>} appliedByModuleNameTransformers
 * @property {boolean} byFileNamePatternTransformersApplied
 */

/**
 * @typedef {Object.<string, ExecutedHook>} ExecutedHooks
 */

/** @type {ExecutedHooks} */
let executedHooks = {};
/** @type {Object.<string, *>} */
let byModuleNameTransformers = {};

/** @type {Array<FileNamePatternTransformer>} */
let byFileNamePatternTransformers = [];
const origLoad = /** @type {*} */ (Module)._load;

/** @type {import('../logger').GenericLogger} */
let logger;

logger = require('../logger').getLogger('util/requireHook', newLogger => {
  logger = newLogger;
});

/**
 * @param {import('./normalizeConfig').InstanaConfig} [config]
 */
// eslint-disable-next-line no-unused-vars
exports.init = function (config) {
  /** @type {*} */ (Module)._load = patchedModuleLoad;
};

/**
 * @param {string} moduleName
 */
function patchedModuleLoad(moduleName) {
  // First attempt to always get the module via the original implementation
  // as this action may fail. The original function populates the module cache.
  const moduleExports = origLoad.apply(Module, arguments);

  /** @type {string} */
  const filename = /** @type {*} */ (Module)._resolveFilename.apply(Module, arguments);

  // We are not directly manipulating the global module cache because there might be other tools fiddling with
  // Module._load. We don't want to break any of them.
  const cacheEntry = (executedHooks[filename] = executedHooks[filename] || {
    originalModuleExports: moduleExports,
    moduleExports,

    // We might have already seen and processed, i.e. manipulated, this require statement. This is something we
    // are checking using these fields.
    appliedByModuleNameTransformers: [],
    byFileNamePatternTransformersApplied: false
  });

  // Some non-APM modules are fiddling with the require cache in some very unexpected ways.
  // For example the request-promise* modules use stealthy-require to always get a fresh copy
  // of the request module. Instead of adding a mechanism to get a copy the request function,
  // they temporarily force clear the require cache and require the request module again
  // to get a copy.
  //
  // In order to ensure that any such (weird) use cases are supported by us, we are making sure
  // that we only return our patched variant when Module._load returned the same object based
  // on which we applied our patches.
  if (cacheEntry.originalModuleExports !== moduleExports) {
    return moduleExports;
  }

  const applicableByModuleNameTransformers = byModuleNameTransformers[moduleName];
  if (applicableByModuleNameTransformers && cacheEntry.appliedByModuleNameTransformers.indexOf(moduleName) === -1) {
    for (let i = 0; i < applicableByModuleNameTransformers.length; i++) {
      const transformerFn = applicableByModuleNameTransformers[i];
      if (typeof transformerFn === 'function') {
        try {
          cacheEntry.moduleExports = transformerFn(cacheEntry.moduleExports, filename) || cacheEntry.moduleExports;
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
          'A requireHook invariant has been violated for module name %s, index %s. The transformer is not a function ' +
            'but of type "%s" (details: %s). The most likely cause is that something has messed with Node.js\' ' +
            'module cache. This can result in limited tracing and health check functionality (for example, missing ' +
            'calls in Instana).',
          moduleName,
          i,
          typeof transformerFn,
          transformerFn == null ? 'null/undefined' : transformerFn
        );
      }
    }
    cacheEntry.appliedByModuleNameTransformers.push(moduleName);
  }

  if (!cacheEntry.byFileNamePatternTransformersApplied) {
    for (let i = 0; i < byFileNamePatternTransformers.length; i++) {
      if (byFileNamePatternTransformers[i].pattern.test(filename)) {
        cacheEntry.moduleExports =
          byFileNamePatternTransformers[i].fn(cacheEntry.moduleExports, filename) || cacheEntry.moduleExports;
      }
    }
    cacheEntry.byFileNamePatternTransformersApplied = true;
  }

  return cacheEntry.moduleExports;
}

exports.teardownForTestPurposes = function () {
  /** @type {*} */ (Module)._load = origLoad;
  executedHooks = {};
  byModuleNameTransformers = {};
  byFileNamePatternTransformers = [];
};

/**
 * @param {string} moduleName
 * @param {Function} fn
 */
exports.onModuleLoad = function on(moduleName, fn) {
  byModuleNameTransformers[moduleName] = byModuleNameTransformers[moduleName] || [];
  byModuleNameTransformers[moduleName].push(fn);
};

/**
 * @param {RegExp} pattern
 * @param {Function} fn
 */
exports.onFileLoad = function onFileLoad(pattern, fn) {
  byFileNamePatternTransformers.push({
    pattern,
    fn
  });
};

/**
 * @param {Array<string>} arr
 */
exports.buildFileNamePattern = function buildFileNamePattern(arr) {
  return new RegExp(`${arr.reduce(buildFileNamePatternReducer, '')}$`);
};

/**
 * @param {string} agg
 * @param {string} pathSegment
 * @returns {string}
 */
function buildFileNamePatternReducer(agg, pathSegment) {
  if (agg.length > 0) {
    agg += `\\${path.sep}`;
  }
  agg += pathSegment;
  return agg;
}
