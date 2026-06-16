/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const transformers = require('./transformers');
const mappers = require('./mappers');
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
 * @returns {Object} Payload matching { resourceSpans: [...] }
 */
function convert(spans) {
  if (!Array.isArray(spans) || spans.length === 0) {
    return { resourceSpans: [] };
  }

  const otlpFormattedSpans = [];

  spans.forEach(span => {
    if (isLogSpan(span)) {
      return;
    }

    try {
      const mappedSpan = {
        ...transformers.spanMetaData.extractSpanMetadata(span, mappers),
        attributes: transformers.spanAttributes.extractSpanAttributes(span, mappers)
      };
      otlpFormattedSpans.push(mappedSpan);
    } catch (error) {
      logger?.debug('Failed to transform individual OTLP span context:', error);
    }
  });

  if (otlpFormattedSpans.length === 0) {
    return { resourceSpans: [] };
  }

  const resource = transformers.resource.extractResourceAttributes(spans[0]);

  return {
    resourceSpans: [
      {
        resource,
        scopeSpans: [
          {
            scope: INSTRUMENTATION_SCOPE,
            spans: otlpFormattedSpans
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
