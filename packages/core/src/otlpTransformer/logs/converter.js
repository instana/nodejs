/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const transformers = require('./transformers');
const mappers = require('./mappers');

const { INSTRUMENTATION_SCOPE } = transformers.resource;

/**
 * @type {import("../../core").GenericLogger | undefined}
 */
let logger;

/**
 * @param {import('../../config').InstanaConfig} config
 */
function init(config) {
  logger = config?.logger;
}

/**
 * @param {import('../../core').InstanaBaseSpan[]} spans Instana log spans
 * @returns {Object} Payload matching { resourceLogs: [...] }
 */
function convert(spans) {
  const logRecords = [];
  /** @type {any} */
  let sampleResourceSpan = null;

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];

    try {
      logRecords.push(transformers.logRecord.extractLogRecord(span, mappers.logRecordMappings));

      // All spans in the same process share the same resource
      // Extract resource once from the first valid span
      if (sampleResourceSpan === null) {
        sampleResourceSpan = span;
      }
    } catch (error) {
      logger?.debug('Failed to convert log span to OTLP format.', error);
    }
  }

  if (logRecords.length === 0) {
    return { resourceLogs: [] };
  }

  const resource = transformers.resource.extractResourceAttributes(sampleResourceSpan);

  return {
    resourceLogs: [
      {
        resource,
        scopeLogs: [
          {
            scope: INSTRUMENTATION_SCOPE,
            logRecords
          }
        ]
      }
    ]
  };
}

module.exports = {
  init,
  convert
};
