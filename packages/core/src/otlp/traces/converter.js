/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const transformers = require('./transformers');
const mappers = require('./mappers');
const { isLogSpan } = require('./util');

const SCOPE = {
  name: transformers.resource.SCOPE_NAME,
  version: transformers.resource.SCOPE_VERSION
};

/**
 * @type {import("../../core").GenericLogger | undefined}
 */
let logger;

/**
 * @param {import('../../config').InstanaConfig} config
 */
function init(config) {
  logger = config.logger;
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
    // TODO: Add log span converter
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

  if (otlpFormattedSpans.length === 0) return { resourceSpans: [] };

  // All spans in the same process share the same resource
  // Extract resource once from the first span
  const resource = transformers.resource.extractResourceAttributes(spans[0]);

  return {
    resourceSpans: [
      {
        resource,
        scopeSpans: [
          {
            scope: SCOPE,
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
