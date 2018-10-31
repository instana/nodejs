'use strict';

var opentracing = require('opentracing');
var constants = require('../constants');
var Span = require('./Span');

var baggageKeyPrefix = 'x-instana-b-';

var valueEncoders = {};
valueEncoders[opentracing.FORMAT_TEXT_MAP] = identity;
valueEncoders[opentracing.FORMAT_HTTP_HEADERS] = encodeURIComponent;

var valueDecoders = {};
valueDecoders[opentracing.FORMAT_TEXT_MAP] = identity;
valueDecoders[opentracing.FORMAT_HTTP_HEADERS] = decodeURIComponent;

function Tracer(isActive) {
  opentracing.Tracer.apply(this, arguments);
  this._isActive = isActive;
}
module.exports = Tracer;

Tracer.prototype = Object.create(opentracing.Tracer.prototype);

Tracer.prototype._startSpan = function _startSpan(name, fields) {
  return new Span(this, name, fields);
};

Tracer.prototype._inject = function _inject(spanContext, format, carrier) {
  if (format !== opentracing.FORMAT_TEXT_MAP && format !== opentracing.FORMAT_HTTP_HEADERS) {
    // Only text formats supported right now
    return;
  }

  if (carrier == null || spanContext == null) {
    // For some reason this case is not handled by the OpenTracing abstraction.
    return;
  }

  carrier[constants.spanIdHeaderNameLowerCase] = spanContext.s;
  carrier[constants.traceIdHeaderNameLowerCase] = spanContext.t;
  carrier[constants.traceLevelHeaderNameLowerCase] = String(spanContext.samplingPriority);

  var valueEncoder = valueEncoders[format];
  Object.keys(spanContext.baggage).forEach(function(baggageKey) {
    carrier[baggageKeyPrefix + baggageKey] = valueEncoder(spanContext.baggage[baggageKey]);
  });
};

Tracer.prototype._extract = function _extract(format, carrier) {
  if (format !== opentracing.FORMAT_TEXT_MAP && format !== opentracing.FORMAT_HTTP_HEADERS) {
    // Only text formats supported right now
    return null;
  }

  if (carrier == null) {
    // For some reason this case is not handled by the OpenTracing abstraction.
    return null;
  }

  var valueDecoder = valueDecoders[format];

  var spanContext = new opentracing.SpanContext();
  spanContext.s = carrier[constants.spanIdHeaderNameLowerCase];
  spanContext.t = carrier[constants.traceIdHeaderNameLowerCase];
  spanContext.samplingPriority = Number(carrier[constants.traceLevelHeaderNameLowerCase]);
  if (isNaN(spanContext.samplingPriority)) {
    spanContext.samplingPriority = 0;
  }

  spanContext.baggage = {};
  Object.keys(carrier).forEach(function(carrierKey) {
    if (carrierKey.indexOf(baggageKeyPrefix) !== 0) {
      return;
    }

    var baggageKey = carrierKey.substring(baggageKeyPrefix.length);
    spanContext.baggage[baggageKey] = valueDecoder(carrier[carrierKey]);
  });

  // ensure that both t and s aren't used when SpanContext data is incomplete
  if (spanContext.s == null || spanContext.t == null) {
    spanContext.s = null;
    spanContext.t = null;
  }

  return spanContext;
};

Tracer.prototype.activate = function activate() {
  this._isActive = true;
};

Tracer.prototype.deactivate = function deactivate() {
  this._isActive = false;
};

function identity(v) {
  return v;
}
