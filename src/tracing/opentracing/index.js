'use strict';

var opentracing = require('opentracing');

var isActive = false;
var tracer;
var hook;
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

  // Lazy lood hook to ensure that its dependencies will only be loaded when actually necessary.
  if (!hook) {
    hook = require('../hook');
  }

  var handleData = hook.getCurrentHandleData();
  if (!handleData) {
    return null;
  }

  var t = handleData.traceId;
  var s = handleData.spanId || handleData.parentSpanId;
  if (!t || !s) {
    return null;
  }

  var spanContext = new opentracing.SpanContext();
  spanContext.s = s;
  spanContext.t = t;
  spanContext.samplingPriority = handleData.suppressTracing ? 0 : 1;
  return spanContext;
};
