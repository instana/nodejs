/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { INSTRUMENTATION_TYPES } = require('./constants');

/**
 * @param {import('../../core').InstanaBaseSpan} span
 */
function getSpanType(span) {
  // special case for otel spans
  if (span?.n === 'otel') {
    return 'otel';
  }

  const keys = Object.keys(span?.data || {});

  return keys.find(key => key !== INSTRUMENTATION_TYPES.PEER && key !== 'resource') || null;
}

/**
 * @param {import('../../core').InstanaBaseSpan} span
 * @param {string} [type]
 */
function getSpanData(span, type) {
  return type ? span.data?.[type] : null;
}

function toUpperCase(str) {
  return typeof str === 'string' ? str.toUpperCase() : '';
}

function toInteger(val) {
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
/**
 * @param {any} _spanData
 * @param {any[]} values
 */
function firstDefined(_spanData, values) {
  return values.find(v => v != null);
}

/**
 * @param {any} _spanData
 * @param {any[]} values
 */
function joinWith(_spanData, values, sep = ':') {
  return values.filter(v => v != null).join(sep);
}

const extractHost = (/** @type {string | URL} */ connection) => parseConnection(connection).host;
const extractPort = (/** @type {string | URL} */ connection) => parseConnection(connection).port;

/**
 * @param {string | URL} connection
 */
function parseConnection(connection) {
  if (!connection) return {};

  try {
    const url = new URL(connection);

    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : undefined
    };
  } catch {
    return {};
  }
}

function combineFields(data, keys) {
  if (!data || !Array.isArray(keys)) return '';
  const parts = [];
  keys.forEach(key => {
    if (data[key] !== undefined && data[key] !== null) {
      parts.push(data[key]);
    }
  });
  return parts.join('.');
}

function formatOTLPValue(value) {
  const type = typeof value;
  if (type === 'string') return { stringValue: value };
  if (type === 'number') {
    return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
  }
  if (type === 'boolean') return { boolValue: value };
  if (type === 'object' && value !== null) return { stringValue: JSON.stringify(value) };
  return { stringValue: String(value) };
}

/**
 * Fast interceptor to identify log frames on the hot path
 */
function isLogSpan(span) {
  if (!span) return false;
  if (span.data && span.data.log) return true;
  if (span.n && typeof span.n === 'string' && span.n.startsWith('log.')) return true;
  return false;
}

module.exports = {
  toUpperCase,
  toInteger,
  combineFields,
  formatOTLPValue,
  isLogSpan,
  extractHost,
  extractPort,
  joinWith,
  firstDefined,
  getSpanData,
  getSpanType
};
