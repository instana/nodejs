/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { SEVERITY_NUMBERS } = require('./constants');

/**
 * @param {any} message
 * @returns {{ stringValue: string } | undefined}
 */
function toBody(message) {
  return { stringValue: String(message) };
}

/**
 * @param {any} level
 * @returns {string | undefined}
 */
function normalizeLevel(level) {
  const normalized = String(level).trim().toLowerCase();
  return normalized === '' ? undefined : normalized;
}

/**
 * @param {any} level
 * @returns {string | undefined}
 */
function toSeverityText(level) {
  if (level && String(level).trim() !== '') {
    return String(level);
  }
  return undefined;
}

/**
 * @param {any} level
 * @returns {number | undefined}
 */
function toSeverityNumber(level) {
  if (level && String(level).trim() !== '') {
    const normalized = normalizeLevel(level);
    return normalized ? SEVERITY_NUMBERS.get(normalized) : undefined;
  }
  return undefined;
}

module.exports = {
  toBody,
  toSeverityText,
  toSeverityNumber
};
