'use strict';

const opentracing = require('opentracing');

let isActive = false;
let tracer;
let cls;
let automaticTracingEnabled = false;

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
  spanContext.s = s;
  spanContext.t = t;
  spanContext.samplingPriority = cls.tracingLevel() === '0' ? 0 : 1;
  spanContext.baggage = {};
  return spanContext;
};
