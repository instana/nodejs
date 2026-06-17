/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const instanaMappings = require('./instanaInstrumentationMappings');
const otelMappings = require('./otelInstrumentationMappings');

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 */
function get(span) {
  return otelMappings.isOtelSpan(span) ? otelMappings : instanaMappings;
}

module.exports = {
  get
};
