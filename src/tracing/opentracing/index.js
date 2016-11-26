'use strict';

var opentracing = require('./opentracingImplementationProvider');

var isActive = false;
var tracer;
var hook;

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
  // Lazy lood hook to ensure that its dependencies will only be loaded when actually necessary.
  if (!hook) {
    hook = require('../hook');
  }

  var uid = hook.getCurrentUid();
  var t = hook.getTraceId(uid);
  if (!t) {
    return null;
  }

  var s = hook.getSpanId(uid) || hook.getParentSpanId(uid);
  var spanContext = new opentracing.SpanContext();
  spanContext.s = s;
  spanContext.t = t;
  spanContext.samplingPriority = hook.isTracingSuppressed(uid) ? 0 : 1;
  return spanContext;
};
