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

  const otlpSpans = [];
  let sampleResourceSpan = null;

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (isLogSpan(span)) {
      // TODO: Add log span converter
      continue;
    }

    try {
      const mapper = mappers.get(span);
      const otlpSpan = {
        ...transformers.spanMetadata.extractSpanMetadata(span, mapper),
        attributes: transformers.spanAttributes.extractSpanAttributes(span, mapper)
      };

      // All spans in the same process share the same resource
      // Extract resource once from the first valid span
      if (sampleResourceSpan === null) {
        sampleResourceSpan = span;
      }

      otlpSpans.push(otlpSpan);
    } catch (error) {
      logger?.debug('Failed to convert span to OTLP format.', error);
    }
  }

  if (otlpSpans.length === 0) {
    return { resourceSpans: [] };
  }

  const resource = transformers.resource.extractResourceAttributes(sampleResourceSpan);

  return {
    resourceSpans: [
      {
        resource,
        scopeSpans: [
          {
            scope: INSTRUMENTATION_SCOPE,
            spans: otlpSpans
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
