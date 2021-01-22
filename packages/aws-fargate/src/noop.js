/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

// We need to require core to provide noop implementations for currentSpan, sdk etc. but neither tracing nor metric
// collection will be activated. (Neither core.init nor core.preInit are called.)
const instanaCore = require('@instana/core');

const { tracing } = instanaCore;

exports.currentSpan = function getHandleForCurrentSpan() {
  return tracing.getHandleForCurrentSpan();
};

exports.sdk = tracing.sdk;

exports.setLogger = function setLogger(logger) {
  instanaCore.logger.init({ logger });
};

exports.opentracing = tracing.opentracing;
