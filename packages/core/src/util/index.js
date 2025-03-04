/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const applicationUnderMonitoring = require('./applicationUnderMonitoring');
const clone = require('./clone');
const compression = require('./compression');
const ensureNestedObjectExists = require('./ensureNestedObjectExists');
const excludedFromInstrumentation = require('./excludedFromInstrumentation');
const hasThePackageBeenInitializedTooLate = require('./initializedTooLateHeuristic');
const normalizeConfig = require('./normalizeConfig');
const propertySizes = require('./propertySizes');
const requireHook = require('./requireHook');
const slidingWindow = require('./slidingWindow');
const stackTrace = require('./stackTrace');
const iitmHook = require('./iitmHook');
const hook = require('./hook');
const esm = require('./esm');
const preloadFlags = require('./getPreloadFlags');
const configNormalizers = require('./configNormalizers');
const spanFilter = require('./spanFilter');
const yamlReader = require('./yamlReader');

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

/**
 * @param {import('@instana/core/src/util/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
  hasThePackageBeenInitializedTooLate.init(config);
  applicationUnderMonitoring.init(config);
  requireHook.init(config);
  preloadFlags.init(config);
  iitmHook.init(config);
  configNormalizers.init(config);
  spanFilter.init(config);
  yamlReader.init(config);
  configNormalizers.init(config);
};

exports.applicationUnderMonitoring = applicationUnderMonitoring;

/**
 * Make sure that a function is only ever called once. This is useful to maintain
 * the contract that a callback should only ever be called once.
 *
 * Any violations against this contract will be logged for further analysis.
 *
 * @param {String} name The name of the callback to make debugging easier.
 * @param {(...args: *) => *} cb The callback to execute at most once.
 * @return {(...args: *) => *} A wrapped function which will forward the first call to `cb`
 *   and log any successive calls.
 */
exports.atMostOnce = function atMostOnce(name, cb) {
  let callCount = 0;
  return function callbackWrappedForAtMostOneExecution() {
    callCount++;
    if (callCount === 1) {
      return cb.apply(null, arguments);
    }
    const argObj = {
      args: Array.prototype.slice.call(arguments)
    };

    logger.debug(
      `Function ${name} was called ${callCount} times. This time with the following arguments: ${JSON.stringify(
        argObj
      )}`
    );
  };
};

exports.preloadFlags = preloadFlags;
exports.clone = clone;
exports.compression = compression;
exports.ensureNestedObjectExists = ensureNestedObjectExists;
exports.excludedFromInstrumentation = excludedFromInstrumentation;
exports.hasThePackageBeenInitializedTooLate = hasThePackageBeenInitializedTooLate;
exports.normalizeConfig = normalizeConfig;
exports.propertySizes = propertySizes;
exports.requireHook = requireHook;
exports.slidingWindow = slidingWindow;
exports.stackTrace = stackTrace;
exports.iitmHook = iitmHook;
exports.hook = hook;
exports.esm = esm;
exports.configNormalizers = configNormalizers;
exports.spanFilter = spanFilter;
exports.yamlReader = yamlReader;
