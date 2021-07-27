/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const opentracing = require('opentracing');

let isActive = false;
/** @type {import('./Tracer')} */
let tracer;
/** @type {import('../cls')} */
let cls;
let automaticTracingEnabled = false;

/**
 * @param {import('../../util/normalizeConfig').InstanaConfig} config
 * @param {boolean} _automaticTracingEnabled
 * @param {import('../../../../collector/src/pidStore')} processIdentityProvider
 */
exports.init = function init(config, _automaticTracingEnabled, processIdentityProvider) {
  automaticTracingEnabled = _automaticTracingEnabled;
  require('./Span').init(config, processIdentityProvider);
};

exports.createTracer = function createTracer() {
  if (!tracer) {
    const Tracer = require('./Tracer');
    tracer = new Tracer(isActive);
  }
  return tracer;
};

exports.activate = function activate() {
  isActive = true;
  if (tracer) {
    tracer.activate();
  }
};

exports.deactivate = function deactivate() {
  isActive = false;
  if (tracer) {
    tracer.deactivate();
  }
};

exports.getCurrentlyActiveInstanaSpanContext = function getCurrentlyActiveInstanaSpanContext() {
  if (!automaticTracingEnabled) {
    return null;
  }

  // Lazy load cls to ensure that its dependencies will only be loaded when actually necessary.
  if (!cls) {
    cls = require('../cls');
  }

  const currentSpan = cls.getCurrentSpan();
  if (!currentSpan) {
    return null;
  }

  const t = currentSpan.t;
  const s = currentSpan.s;
  if (!t || !s) {
    return null;
  }

  const spanContext = new opentracing.SpanContext();
  // @ts-ignore
  spanContext.s = s;
  // @ts-ignore
  spanContext.t = t;
  // @ts-ignore
  spanContext.samplingPriority = cls.tracingLevel() === '0' ? 0 : 1;
  // @ts-ignore
  spanContext.baggage = {};
  return spanContext;
};
