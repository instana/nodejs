/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const callback = require('./sdk')(true);
const promise = require('./sdk')(false);
/** @type {import('../cls')} */
let cls;

/**
 * @param {import('../cls')} _cls
 */
exports.init = function init(_cls) {
  cls = _cls;
  callback.init(_cls);
  promise.init(_cls);
};

exports.activate = function activate() {
  callback.activate();
  promise.activate();
};

exports.deactivate = function deactivate() {
  callback.deactivate();
  promise.deactivate();
};

/**
 * Acquire the asynchronous context to use it with runInAsyncContext or runPromiseInAsyncContext later.
 *
 * Under normal circumstances, you do not need this, as the asynchronous context is managed transparently and
 * automatically by @instana/collector and the Node.js runtime. However, there are libraries that break async_hook
 * continuity. These methods enable users of @instana/collector to work around these issues.
 */
exports.getAsyncContext = function getAsyncContext() {
  if (!cls) {
    return null;
  }
  return cls.getAsyncContext();
};

/**
 * Run a function in the given async context, which has been acquired via getAsyncContext earlier.
 *
 * Under normal circumstances, you do not need this, as the asynchronous context is managed transparently and
 * automatically by @instana/collector and the Node.js runtime. However, there are libraries that break async_hook
 * continuity. These methods enable users of @instana/collector to work around these issues.
 *
 * This is the variant that you are probably looking for if you need to fix async_hook continuity issues.
 * @param {import('../clsHooked/context').InstanaCLSContext} context
 * @param {Function} fn
 */
exports.runInAsyncContext = function runInAsyncContext(context, fn) {
  if (!cls) {
    return fn();
  }
  cls.runInAsyncContext(context, fn);
};

/**
 * Run a function that creates a promise in the given async context and return the resulting promise. The provided
 * context must have been acquired earlier via getAsyncContext.
 *
 * Under normal circumstances, you do not need this, as the asynchronous context is managed transparently and
 * automatically by @instana/collector and the Node.js runtime. However, there are libraries that break async_hook
 * continuity. These methods enable users of @instana/collector to work around these issues.
 *
 * This is the variant that you are probably looking for if you need to fix async_hook continuity issues with a promise
 * based library.
 * @param {import('../clsHooked/context').InstanaCLSContext} context
 * @param {Function} fn
 */
exports.runPromiseInAsyncContext = function runPromiseInAsyncContext(context, fn) {
  if (!cls) {
    return fn();
  }
  return cls.runPromiseInAsyncContext(context, fn);
};

exports.callback = callback;
exports.promise = promise;
exports.async = promise;
