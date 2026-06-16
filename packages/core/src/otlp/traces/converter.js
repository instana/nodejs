/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../common/context');
const transformers = require('./transformers');
const { getInstrumentationMappings } = require('./mappers/spanAttributes');
const { getMetadataMappings } = require('./mappers/spanMetaData');
const { INSTRUMENTATION_SCOPE } = require('../common/mappers/resource');
const { isLogSpan } = require('./util');

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
 * Converts Instana spans into an OTLP trace export payload.
 *
 * @param {import('../../core').InstanaBaseSpan[]} spans
 * @returns {{ resourceSpans: Array }}
 */
function convert(spans) {
  if (!Array.isArray(spans) || spans.length === 0) {
    return { resourceSpans: [] };
  }
  // Mapping definitions are shared across all spans in the batch.
  const otlpSemConv = ctx.semConv;
  const instrumentationMappings = getInstrumentationMappings(otlpSemConv);
  const metadataMappings = getMetadataMappings(otlpSemConv, instrumentationMappings);

  const otlpSpans = [];

  spans.forEach(span => {
    // TODO: Add log span converter
    if (isLogSpan(span)) {
      return;
    }

    try {
      const otlpSpan = {
        ...transformers.spanMetaData.extractSpanMetadata(span, metadataMappings),
        attributes: transformers.spanAttributes.extractSpanAttributes(span, instrumentationMappings)
      };
      otlpSpans.push(otlpSpan);
    } catch (error) {
      logger?.debug('Failed to convert span to OTLP format.', error);
    }
  });

  if (otlpSpans.length === 0) return { resourceSpans: [] };

  // All spans in the same process share the same resource
  // Extract resource once from the first span
  const resource = transformers.resource.extractResourceAttributes(spans[0]);

  return buildOtlpPayload(resource, otlpSpans);
}

/**
 * Builds the OTLP Trace Export payload structure.
 *
 * @param {Object} resource
 * @param {Object[]} spans
 * @returns {{ resourceSpans: Array }}
 */
function buildOtlpPayload(resource, spans) {
  return {
    resourceSpans: [
      {
        resource,
        scopeSpans: [
          {
            scope: INSTRUMENTATION_SCOPE,
            spans
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
