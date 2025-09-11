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
const propertySizes = require('./propertySizes');
const requireHook = require('./requireHook');
const slidingWindow = require('./slidingWindow');
const stackTrace = require('./stackTrace');
const iitmHook = require('./iitmHook');
const hook = require('./hook');
const deepMerge = require('./deepMerge');
const esm = require('./esm');
const preloadFlags = require('./getPreloadFlags');
const spanFilter = require('./spanFilter');
const yamlReader = require('./yamlReader');
const disableInstrumentation = require('./disableInstrumentation');

/** @type {import('../instanaCtr').InstanaCtrType} */
let instanaCtr;

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
const atMostOnce = function atMostOnce(name, cb) {
  let callCount = 0;
  return function callbackWrappedForAtMostOneExecution() {
    callCount++;
    if (callCount === 1) {
      return cb.apply(null, arguments);
    }
    const argObj = {
      args: Array.prototype.slice.call(arguments)
    };

    instanaCtr
      .logger()
      .debug(
        `Function ${name} was called ${callCount} times. This time with the following arguments: ${JSON.stringify(
          argObj
        )}`
      );
  };
};

/**
 * @param {import('../config/normalizeConfig').AgentConfig} extraConfig
 */
const activate = function activate(extraConfig) {
  disableInstrumentation.activate(extraConfig);
  spanFilter.activate(extraConfig);
};

/**
 * @typedef {Object} CoreUtilsType
 * @property {typeof applicationUnderMonitoring} applicationUnderMonitoring
 * @property {typeof clone} clone
 * @property {typeof activate} activate
 * @property {typeof deepMerge} deepMerge
 * @property {typeof compression} compression
 * @property {typeof ensureNestedObjectExists} ensureNestedObjectExists
 * @property {typeof excludedFromInstrumentation} excludedFromInstrumentation
 * @property {typeof hasThePackageBeenInitializedTooLate} hasThePackageBeenInitializedTooLate
 * @property {typeof propertySizes} propertySizes
 * @property {typeof requireHook} requireHook
 * @property {typeof slidingWindow} slidingWindow
 * @property {typeof stackTrace} stackTrace
 * @property {typeof iitmHook} iitmHook
 * @property {typeof hook} hook
 * @property {typeof esm} esm
 * @property {typeof preloadFlags} preloadFlags
 * @property {typeof spanFilter} spanFilter
 * @property {typeof yamlReader} yamlReader
 * @property {typeof disableInstrumentation} disableInstrumentation
 * @property {typeof atMostOnce} atMostOnce
 */

/**
 * @param {import('../instanaCtr').InstanaCtrType} _instanaCtr
 */
exports.init = function init(_instanaCtr) {
  instanaCtr = _instanaCtr;

  hasThePackageBeenInitializedTooLate.init(instanaCtr);
  applicationUnderMonitoring.init(instanaCtr);
  requireHook.init(instanaCtr);
  preloadFlags.init(instanaCtr);
  iitmHook.init(instanaCtr);
  spanFilter.init(instanaCtr);
  yamlReader.init(instanaCtr);
  disableInstrumentation.init(instanaCtr);
};

exports.create = () => {
  return {
    preloadFlags,
    clone,
    activate,
    compression,
    applicationUnderMonitoring,
    ensureNestedObjectExists,
    excludedFromInstrumentation,
    hasThePackageBeenInitializedTooLate,
    propertySizes,
    requireHook,
    atMostOnce,
    slidingWindow,
    stackTrace,
    iitmHook,
    hook,
    esm,
    spanFilter,
    yamlReader,
    disableInstrumentation,
    deepMerge
  };
};
