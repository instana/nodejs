/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const instana = require('./instanaInstrumentations');
const otel = require('./otelIntegration');

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 */
function get(span) {
  return otel.isOtelSpan(span) ? otel : instana;
}

module.exports = {
  get
};
