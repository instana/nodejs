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

/** @type {import('../core').GenericLogger} */
let logger;

/**
 * @param {import('../config').InstanaConfig} [config]
 */
exports.init = function (config) {
  logger = config.logger;

  /** @type {*} */ (Module)._load = patchedModuleLoad;
};

/**
 * @param {string} moduleName
 */
function patchedModuleLoad(moduleName) {
  // CASE: when using ESM, the Node runtime passes a full path to Module._load
  //       We aim to extract the module name to apply our instrumentation.
  // CASE: we ignore all file endings, which we are not interested in. Any module can load any file.
  // CASE: The requireHook is not compatible with native ESM so the native ESM is not handled here.
  //       Exception: Starting from version 12, the 'got' module is transitioning to a pure ESM module but
  //       continues to function. This is because 'got' is instrumented coincidentally with the 'http' module.
  //       The instrumentation of 'http' and 'https' works without the requireHook.
  //       See: https://github.com/search?q=repo%3Asindresorhus%2Fgot%20from%20%27http2-wrapper%27&type=code.
  //       This is also the case with 'node-fetch'; from version 3, 'node-fetch' is a pure ESM and uses 'http'
  //       under the hood, working well without requireHook. This differs from our other instrumentations,
  //       where we require 'http' and 'https' at the top. Native ESM libraries that import core Node modules
  //       (e.g., import http from 'node:http') do not  trigger Module._load, hence do not use the requireHook.
  //       However, when an ESM library imports a CommonJS package, our requireHook is triggered.
  //       For native ESM libraries the iitmHook is triggered.
  if (path.isAbsolute(moduleName) && ['.node', '.json', '.ts'].indexOf(path.extname(moduleName)) === -1) {
    // CASE: normalize windows paths (backslashes)
    const normalizedModuleName = moduleName.replace(/\\/g, '/');

    // EDGE CASE for ESM: mysql2/promise.js
    if (normalizedModuleName.indexOf('node_modules/mysql2/promise.js') !== -1) {
      moduleName = 'mysql2/promise';
    } else {
      // e.g. path is node_modules/@elastic/elasicsearch/index.js
      let match = normalizedModuleName.match(/node_modules\/(@.*?(?=\/)\/.*?(?=\/))/);

      if (match && match.length > 1) {
        moduleName = match[1];
      } else {
        // e.g. path is node_modules/mysql/lib/index.js
        match = normalizedModuleName.match(/node_modules\/(.*?(?=\/))/);

        if (match && match.length > 1) {
          moduleName = match[1];
        }
      }
    }
  }

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
          logger.error(
            `Cannot instrument ${moduleName} due to an error in instrumentation: ${e?.message}, ${e?.stack}`
          );
        }
      } else {
        logger.error(
          `A requireHook invariant has been violated for module name ${moduleName}, index ${i}. ` +
            `The transformer is not a function but of type "${typeof transformerFn}" (details:  ${
              transformerFn == null ? 'null/undefined' : transformerFn
            }). The most likely cause is that something has messed with Node.js' ` +
            'module cache. This can result in limited tracing and health check functionality (for example, missing ' +
            'calls in Instana).'
        );
      }
    }
    cacheEntry.appliedByModuleNameTransformers.push(moduleName);
  }

  if (!cacheEntry.byFileNamePatternTransformersApplied) {
    // CASE: normalize windows paths (backslashes)
    const normalizedFilename = filename.replace(/\\/g, '/');

    for (let i = 0; i < byFileNamePatternTransformers.length; i++) {
      if (byFileNamePatternTransformers[i].pattern.test(normalizedFilename)) {
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
