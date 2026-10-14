/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const transformers = require('./transformers');
const mapper = require('./mappers');
const { isLogSpan } = require('./util');

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
 * @param {import('../../core').InstanaBaseSpan[]} spans
 * @returns {{ resourceLogs: Array<any> } | null}
 */
function convert(spans) {
  if (!Array.isArray(spans) || spans.length === 0) {
    return null;
  }

  const otlpLogs = [];
  let sampleResourceSpan = null;

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (!span || !isLogSpan(span)) {
      continue;
    }

    try {
      const otlpLog = transformers.extractLogRecord(span, mapper);

      if (sampleResourceSpan === null) {
        sampleResourceSpan = span;
      }

      otlpLogs.push(otlpLog);
    } catch (error) {
      logger?.debug('Failed to convert log span to OTLP format.', error);
    }
  }

  if (otlpLogs.length === 0) {
    return null;
  }

  const resource = transformers.resource.extractResourceAttributes(sampleResourceSpan);

  return {
    resourceLogs: [
      {
        resource,
        scopeLogs: [
          {
            scope: INSTRUMENTATION_SCOPE,
            logRecords: otlpLogs
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
