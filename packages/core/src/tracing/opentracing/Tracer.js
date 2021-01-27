/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const opentracing = require('opentracing');
const constants = require('../constants');
const Span = require('./Span');

const baggageKeyPrefix = 'x-instana-b-';

const valueEncoders = {};
valueEncoders[opentracing.FORMAT_TEXT_MAP] = identity;
valueEncoders[opentracing.FORMAT_HTTP_HEADERS] = encodeURIComponent;

const valueDecoders = {};
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

  const valueEncoder = valueEncoders[format];
  Object.keys(spanContext.baggage).forEach(baggageKey => {
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

  const valueDecoder = valueDecoders[format];

  const spanContext = new opentracing.SpanContext();
  spanContext.s = carrier[constants.spanIdHeaderNameLowerCase];
  spanContext.t = carrier[constants.traceIdHeaderNameLowerCase];
  spanContext.samplingPriority = Number(carrier[constants.traceLevelHeaderNameLowerCase]);
  if (isNaN(spanContext.samplingPriority)) {
    spanContext.samplingPriority = 0;
  }

  spanContext.baggage = {};
  Object.keys(carrier).forEach(carrierKey => {
    if (carrierKey.indexOf(baggageKeyPrefix) !== 0) {
      return;
    }

    const baggageKey = carrierKey.substring(baggageKeyPrefix.length);
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
