/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const instanaMapper = require('./instanaMapper');
const otelMapper = require('./otelMapper');

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 */
function get(span) {
  return otelMapper.isOtelSpan(span) ? otelMapper : instanaMapper;
}

module.exports = {
  get
};
