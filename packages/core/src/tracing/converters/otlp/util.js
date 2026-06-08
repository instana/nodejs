/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

function toUpperCase(str) {
  return typeof str === 'string' ? str.toUpperCase() : '';
}

function toInteger(val) {
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function combineHostPort(host, port) {
  if (!host) return undefined;
  return port ? `${host}:${port}` : host;
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
  combineHostPort,
  combineFields,
  formatOTLPValue,
  isLogSpan
};
