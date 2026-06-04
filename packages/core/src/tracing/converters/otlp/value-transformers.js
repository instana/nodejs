/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Simple value transformation functions
 * These are separated to avoid circular dependencies with mappers
 */

/**
 * Converts value to uppercase string
 */
function toUpperCase(value) {
  return value ? String(value).toUpperCase() : null;
}

/**
 * Converts value to integer
 */
function toInteger(value) {
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

/**
 * Combines host and port into address string
 */
function combineHostPort(data, keys) {
  const [hostKey, portKey] = keys;
  const host = data[hostKey];
  const port = data[portKey];
  if (!host) return null;
  return port ? `${host}:${port}` : host;
}

/**
 * Generic multi-field combiner with custom separator
 */
function combineFields(data, keys, separator = ':') {
  const values = keys.map(key => data[key]).filter(v => v !== null && v !== undefined);
  return values.length > 0 ? values.join(separator) : null;
}

module.exports = {
  toUpperCase,
  toInteger,
  combineHostPort,
  combineFields
};

// Made with Bob
