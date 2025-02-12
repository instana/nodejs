/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// We need to require core to provide noop implementations for currentSpan, sdk etc. but neither tracing nor metric
// collection will be activated. (Neither core.init nor core.preInit are called.)
const instanaCore = require('@instana/core');
const { tracing } = instanaCore;

exports.wrap = noopWrap;

function noopWrap(_config, originalHandler) {
  if (arguments.length === 1) {
    originalHandler = _config;
    _config = null;
  }

  return originalHandler;
}

exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

exports.setLogger = function setLogger() {
  // We do nothing. Noop.
};

exports.opentracing = tracing.opentracing;
