/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * @param {Record<string, any>} source
 * @param {string} path
 * @returns {any}
 */
function resolvePath(source, path) {
  return path.split('.').reduce((obj, key) => obj?.[key], source);
}

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {Array<import('../mappers/logRecordMappings').LogRecordMapping>} mappings
 * @returns {Record<string, any>} OTLP LogRecord
 */
function extractLogRecord(span, mappings) {
  /** @type {Record<string, any>} */
  const logRecord = {};

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    let value;

    if (mapping.instana) {
      const raw = resolvePath(span, mapping.instana);
      if (!raw) {
        continue;
      }
      value = mapping.transform ? mapping.transform(raw) : raw;
    } else {
      value = mapping.value;
    }

    if (value !== undefined) {
      logRecord[mapping.otlp] = value;
    }
  }

  return logRecord;
}

module.exports = {
  extractLogRecord
};
