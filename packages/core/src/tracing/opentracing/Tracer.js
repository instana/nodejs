/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const opentracing = require('opentracing');
const constants = require('../constants');
const Span = require('./Span');

const baggageKeyPrefix = 'x-instana-b-';

/** @type {Object.<string, Function>} */
const valueEncoders = {};
valueEncoders[opentracing.FORMAT_TEXT_MAP] = identity;
valueEncoders[opentracing.FORMAT_HTTP_HEADERS] = encodeURIComponent;

/** @type {Object.<string, Function>} */
const valueDecoders = {};
valueDecoders[opentracing.FORMAT_TEXT_MAP] = identity;
valueDecoders[opentracing.FORMAT_HTTP_HEADERS] = decodeURIComponent;

/**
 * @param {boolean} isActive
 */
function Tracer(isActive) {
  opentracing.Tracer.apply(this, arguments);
  this._isActive = isActive;
}
module.exports = Tracer;

Tracer.prototype = Object.create(opentracing.Tracer.prototype);

/**
 * @param {string} name
 * @param {import('./Span').SpanFields} fields
 * @returns {Span}
 */
Tracer.prototype._startSpan = function _startSpan(name, fields) {
  return new Span(this, name, fields);
};

/**
 *
 * @param {opentracing.SpanContext} spanContext
 * @param {string} format
 * @param {Object.<string, *>} carrier
 * @returns
 */
Tracer.prototype._inject = function _inject(spanContext, format, carrier) {
  if (format !== opentracing.FORMAT_TEXT_MAP && format !== opentracing.FORMAT_HTTP_HEADERS) {
    // Only text formats supported right now
    return;
  }

  if (carrier == null || spanContext == null) {
    // For some reason this case is not handled by the OpenTracing abstraction.
    return;
  }

  // @ts-ignore
  carrier[constants.spanIdHeaderNameLowerCase] = spanContext.s;
  // @ts-ignore
  carrier[constants.traceIdHeaderNameLowerCase] = spanContext.t;
  // @ts-ignore
  carrier[constants.traceLevelHeaderNameLowerCase] = String(spanContext.samplingPriority);

  const valueEncoder = valueEncoders[format];
  // @ts-ignore
  Object.keys(spanContext.baggage).forEach(baggageKey => {
    // @ts-ignore
    carrier[baggageKeyPrefix + baggageKey] = valueEncoder(spanContext.baggage[baggageKey]);
  });
};

/**
 * @param {string} format
 * @param {*} carrier
 * @returns {opentracing.SpanContext}
 */
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
  // @ts-ignore
  spanContext.s = carrier[constants.spanIdHeaderNameLowerCase];
  // @ts-ignore
  spanContext.t = carrier[constants.traceIdHeaderNameLowerCase];
  // @ts-ignore
  spanContext.samplingPriority = Number(carrier[constants.traceLevelHeaderNameLowerCase]);
  // @ts-ignore
  if (isNaN(spanContext.samplingPriority)) {
    // @ts-ignore
    spanContext.samplingPriority = 0;
  }

  // @ts-ignore
  spanContext.baggage = {};
  Object.keys(carrier).forEach(carrierKey => {
    if (carrierKey.indexOf(baggageKeyPrefix) !== 0) {
      return;
    }

    const baggageKey = carrierKey.substring(baggageKeyPrefix.length);
    // @ts-ignore
    spanContext.baggage[baggageKey] = valueDecoder(carrier[carrierKey]);
  });

  // ensure that both t and s aren't used when SpanContext data is incomplete
  // @ts-ignore
  if (spanContext.s == null || spanContext.t == null) {
    // @ts-ignore
    spanContext.s = null;
    // @ts-ignore
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

/**
 * @param {*} v
 * @returns {*}
 */
function identity(v) {
  return v;
}
