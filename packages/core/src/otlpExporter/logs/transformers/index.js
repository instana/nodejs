/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const resource = require('../../common/transformers/resource');
const logRecordMetaData = require('./logRecordMetaData');
const logAttributes = require('./logAttributes');

/**
 * Assembles a complete OTLP log record from an Instana log span.
 * @param {import('../../../core').InstanaBaseSpan} span
 * @param {import('../mappers/instanaInstrumentationMappings')} mapper
 * @returns {Record<string, any>}
 */
function extractLogRecord(span, mapper) {
  return {
    ...logRecordMetaData.extractLogRecordMetadata(
      span,
      /** @type {Parameters<typeof logRecordMetaData.extractLogRecordMetadata>[1]} */ (mapper)
    ),
    attributes: logAttributes.extractLogAttributes(span, mapper)
  };
}

module.exports = {
  resource,
  extractLogRecord
};
