/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Core OTLP Conversion Functions
 *
 * This module contains the main conversion logic for transforming Instana spans to OTLP format.
 * It orchestrates the conversion process using transformer modules.
 *
 * Main Functions:
 * - convertInstanaSpanToOTLP: Converts a single Instana span to OTLP format
 * - convertInstanaSpanBatchToOTLP: Converts multiple Instana spans with resourceSpans structure
 */

const { extractMetaAttributes, extractResourceAttributes, extractSpanDataAttributes } = require('./transformers');

// ============================================================================
// Main Conversion Functions
// ============================================================================

/**
 * Converts an Instana span to OpenTelemetry format
 * This is the main entry point that orchestrates all conversion steps
 */
function convertInstanaSpanToOTLP(instanaSpan) {
  if (!instanaSpan || typeof instanaSpan !== 'object') {
    throw new Error('Invalid Instana span: must be an object');
  }

  // Step 1: Convert metadata (IDs, timestamps, kind, name, status)
  const metadata = extractMetaAttributes(instanaSpan);

  // Step 2: Convert span data to attributes
  const attributes = extractSpanDataAttributes(instanaSpan);

  // Step 3: Create resource attributes
  const resourceAttributes = extractResourceAttributes(instanaSpan);

  // Step 4: Assemble OTLP span (metadata already includes name and status)
  const otelSpan = {
    ...metadata,
    attributes,
    resource: {
      attributes: resourceAttributes
    }
  };

  // Clean up undefined values
  Object.keys(otelSpan).forEach(key => {
    if (otelSpan[key] === undefined) {
      delete otelSpan[key];
    }
  });

  return otelSpan;
}

/**
 * Converts multiple Instana spans to OTLP format with resourceSpans structure
 * @param {Array<any>} instanaSpans - Array of Instana spans to convert
 * @returns {Array<any>|{resourceSpans: Array<any>}} Empty array if input is invalid,
 *   or object with resourceSpans structure
 */
function convertInstanaSpanBatchToOTLP(instanaSpans) {
  if (!Array.isArray(instanaSpans)) {
    return [];
  }

  if (instanaSpans.length === 0) {
    return { resourceSpans: [] };
  }

  // Convert all spans
  const otelSpans = instanaSpans
    .map(span => {
      try {
        return convertInstanaSpanToOTLP(span);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Error converting span: ${error.message}`);
        return null;
      }
    })
    .filter(span => span !== null);

  // Group spans by resource attributes
  const spansByResource = new Map();

  otelSpans.forEach(otelSpan => {
    const resourceKey = JSON.stringify(otelSpan.resource.attributes);

    if (!spansByResource.has(resourceKey)) {
      spansByResource.set(resourceKey, {
        resource: otelSpan.resource,
        spans: []
      });
    }

    // Remove resource from individual span
    const { resource, ...spanWithoutResource } = otelSpan;
    spansByResource.get(resourceKey).spans.push(spanWithoutResource);
  });

  // Create OTLP ResourceSpans structure
  const resourceSpans = Array.from(spansByResource.values()).map(group => ({
    resource: group.resource,
    scopeSpans: [
      {
        scope: {
          name: '@instana/collector',
          version: '3.0.0'
        },
        spans: group.spans
      }
    ]
  }));

  return { resourceSpans };
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  // Main conversion functions
  convertInstanaSpanToOTLP,
  convertInstanaSpanBatchToOTLP
};

// Made with Bob
