/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {any} str
 * @returns {string}
 */
function toUpperCase(str) {
  return typeof str === 'string' ? str.toUpperCase() : '';
}

/**
 * @param {any[] | any} values
 * @returns {any}
 */
function firstDefined(values) {
  if (!Array.isArray(values)) {
    return values != null ? values : undefined;
  }
  return values.find(v => v != null);
}

/**
 * @param {any[]} values
 * @returns {string}
 */
function joinWith(values) {
  return values.filter(v => v != null).join(':');
}

/**
 * @param {Record<string, any>} data
 * @param {string[]} keys
 * @returns {string}
 */
function combineFields(data, keys) {
  if (!data || !Array.isArray(keys)) return '';
  /** @type {any[]} */
  const parts = [];
  keys.forEach(key => {
    if (data[key] !== undefined && data[key] !== null) {
      parts.push(data[key]);
    }
  });
  return parts.join('.');
}

/**
 * @param {any} value
 * @returns {{ stringValue?: string, intValue?: number, doubleValue?: number, boolValue?: boolean }}
 */
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
 * @returns {{ host?: string, port?: number }}
 */
function parseConnection(connection) {
  if (!connection) {
    return {};
  }

  try {
    const connectionStr = typeof connection === 'string' ? connection : connection.toString();
    const url = new URL(connectionStr.includes('://') ? connectionStr : `http://${connectionStr}`);

    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : undefined
    };
  } catch {
    return {};
  }
}

/**
 * @param {string | URL} connection
 * @returns {string | undefined}
 */
const extractHost = connection => parseConnection(connection).host;

/**
 * @param {string | URL} connection
 * @returns {number | undefined}
 */
const extractPort = connection => parseConnection(connection).port;

module.exports = {
  toUpperCase,
  firstDefined,
  joinWith,
  combineFields,
  formatOTLPValue,
  extractHost,
  extractPort
};
