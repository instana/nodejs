/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Core OTLP Conversion Functions
 *
 * This module contains the main conversion logic for transforming Instana spans to OTLP format.
 * It orchestrates the conversion process using helper functions from transform-utils.js
 *
 * Main Functions:
 * - convertInstanaSpanToOTLP: Converts a single Instana span to OTLP format
 * - convertInstanaSpanBatchToOTLP: Converts multiple Instana spans with resourceSpans structure
 * - extractResourceAttributes: Creates resource attributes for OTLP format
 * - extractMetaAttributes: Converts Instana base fields to OTLP metadata
 * - extractSpanDataAttributes: Extracts and converts span data to OTLP attributes
 */

const { METADATA_MAPPINGS } = require('./mappers');
const {
  convertEndTime,
  generateSpanName,
  generateSpanStatus,
  applyMappingsForSpanType
} = require('./utils/transform-utils');

// ============================================================================
// Span Data Extraction
// ============================================================================

/**
 * Extracts and converts Instana span data to OTLP attributes
 * Handles multiple data keys (e.g., mongo + peer)
 */
function extractSpanDataAttributes(instanaSpan) {
  if (!instanaSpan || !instanaSpan.data) {
    return [];
  }

  const allAttributes = [];

  // Process each data key
  Object.entries(instanaSpan.data).forEach(([spanType, spanData]) => {
    const attributes = applyMappingsForSpanType(spanType, spanData);
    allAttributes.push(...attributes);
  });

  return allAttributes;
}

// ============================================================================
// Metadata Transformation
// ============================================================================

/**
 * Applies metadata transformations to convert Instana base fields to OTLP
 */
function extractMetaAttributes(instanaSpan) {
  const result = {};

  // Map of getter function names to actual functions
  const getterFunctions = {
    generateSpanName,
    generateSpanStatus
  };

  Object.entries(METADATA_MAPPINGS).forEach(([instanaField, mapping]) => {
    // Handle getter-based mappings (functions that need full span context)
    if (mapping.getter) {
      const getterFn = typeof mapping.getter === 'string' ? getterFunctions[mapping.getter] : mapping.getter;
      if (getterFn) {
        const value = getterFn(instanaSpan);
        if (value !== null && value !== undefined) {
          result[mapping.otlp] = value;
        }
      }
      return;
    }

    const instanaValue = instanaSpan[instanaField];

    // Skip if field doesn't exist (except optional parent)
    if (instanaValue === undefined) {
      if (instanaField === 'p') return; // Parent is optional
      return;
    }

    // Apply transformation
    if (mapping.transform) {
      const transformedValue = mapping.transform(instanaValue);
      if (transformedValue !== null && transformedValue !== undefined) {
        result[mapping.otlp] = transformedValue;
      }
    }
  });

  // Calculate end time from start + duration
  if (instanaSpan.ts !== undefined && instanaSpan.d !== undefined) {
    result.endTimeUnixNano = convertEndTime(instanaSpan);
  }

  return result;
}

// ============================================================================
// Resource Attributes
// ============================================================================

/**
 * Creates resource attributes for OTLP format
 */
// TODO: get the data dynamically from package.json
function extractResourceAttributes(instanaSpan) {
  const attributes = [];

  // TODO: instead of unknown service, use config.service-name ?
  const serviceName = instanaSpan.data?.service || 'unknown-service';

  attributes.push({
    key: 'service.name',
    value: { stringValue: serviceName }
  });

  // SDK information
  attributes.push(
    {
      key: 'telemetry.sdk.language',
      value: { stringValue: 'nodejs' }
    },
    {
      key: 'telemetry.sdk.name',
      value: { stringValue: '@instana/collector' }
    },
    {
      key: 'telemetry.sdk.version',
      value: { stringValue: '3.0.0' }
    }
  );

  return attributes;
}

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
  convertInstanaSpanBatchToOTLP,

  // Helper functions (used by main conversion functions)
  extractMetaAttributes,
  extractSpanDataAttributes,
  extractResourceAttributes
};

// Made with Bob
