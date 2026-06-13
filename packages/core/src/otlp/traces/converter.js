/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const transformers = require('./transformers');
const { isLogSpan } = require('./util');

const SCOPE = {
  name: transformers.resource.SCOPE_NAME,
  version: transformers.resource.SCOPE_VERSION
};

let logger;

/**
 * @param {Object} config
 */
function init(config) {
  logger = config?.logger;
}

/**
 * @param {Array<Object>} spans
 * @returns {Object} Payload matching { resourceSpans: [...] }
 */
function convert(spans) {
  if (!Array.isArray(spans) || spans.length === 0) {
    return { resourceSpans: [] };
  }

  const otelSpans = [];

  spans.forEach(rawSpan => {
    // TODO: Add log span converter
    if (isLogSpan(rawSpan)) {
      return;
    }

    try {
      const mappedSpan = {
        ...transformers.spanMetaData.extractSpanMetadata(rawSpan),
        attributes: transformers.spanAttributes.extractSpanAttributes(rawSpan)
      };

      otelSpans.push(mappedSpan);
    } catch (error) {
      logger?.debug('Failed to transform individual OTLP span context:', error);
    }
  });

  if (otelSpans.length === 0) return { resourceSpans: [] };

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
            spans: otelSpans
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
