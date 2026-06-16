/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

function toUpperCase(str) {
  return typeof str === 'string' ? str.toUpperCase() : '';
}

/**
 * @param {any[]} values
 */
function firstDefined(values) {
  if (!Array.isArray(values)) {
    return values != null ? values : undefined;
  }
  return values.find(v => v != null);
}

/**
 * @param {any[]} values
 */
function joinWith(values) {
  return values.filter(v => v != null).join(':');
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

const extractHost = (/** @type {string | URL} */ connection) => parseConnection(connection).host;
const extractPort = (/** @type {string | URL} */ connection) => parseConnection(connection).port;

module.exports = {
  toUpperCase,
  firstDefined,
  joinWith,
  combineFields,
  formatOTLPValue,
  extractHost,
  extractPort
};
