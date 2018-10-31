'use strict';

var opentracing = require('opentracing');

var isActive = false;
var tracer;
var cls;
var automaticTracingEnabled = false;

exports.init = function init(config, _automaticTracingEnabled) {
  automaticTracingEnabled = _automaticTracingEnabled;

  require('./Span').init(config);
};

exports.createTracer = function createTracer() {
  if (!tracer) {
    var Tracer = require('./Tracer');
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

  var currentSpan = cls.getCurrentSpan();
  if (!currentSpan) {
    return null;
  }

  var t = currentSpan.t;
  var s = currentSpan.s;
  if (!t || !s) {
    return null;
  }

  var spanContext = new opentracing.SpanContext();
  spanContext.s = s;
  spanContext.t = t;
  spanContext.samplingPriority = cls.tracingLevel() === '0' ? 0 : 1;
  spanContext.baggage = {};
  return spanContext;
};
