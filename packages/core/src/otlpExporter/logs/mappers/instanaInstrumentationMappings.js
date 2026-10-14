/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const {
  transformBody,
  transformSeverityText,
  transformSeverityNumber,
  transformTraceId,
  transformSpanId,
  transformTimeUnixNano
} = require('./util');

/**
 * @typedef {(span: import('../../../core').InstanaBaseSpan) => any} TransformFunction
 */

/**
 * @typedef {Object} LogFieldMapping
 * @property {string} field
 * @property {TransformFunction} transform
 */

/** @type {LogFieldMapping[]} */
const logMappings = [
  { field: 'traceId', transform: transformTraceId },
  { field: 'spanId', transform: transformSpanId },
  { field: 'timeUnixNano', transform: transformTimeUnixNano },
  { field: 'body', transform: transformBody },
  { field: 'severityText', transform: transformSeverityText },
  { field: 'severityNumber', transform: transformSeverityNumber },
  { field: 'logAttributes', transform: () => [] }
];

module.exports = logMappings.reduce((acc, { field, transform }) => {
  acc[field] = transform;
  return acc;
}, /** @type {Record<string, TransformFunction>} */ ({}));
