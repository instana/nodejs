/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// We need to require core to provide noop implementations for currentSpan, sdk etc. but no tracing
// will be activated. (Neither core.init nor core.preInit are called.)
const instanaCore = require('@instana/core');

const { tracing } = instanaCore;

exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

exports.setLogger = function setLogger() {
  // We do nothing.
};

exports.opentracing = tracing.opentracing;
