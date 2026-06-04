/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Instana to OpenTelemetry OTLP Converter
 *
 * This module provides the main entry point for converting Instana spans to OTLP format.
 * It combines the converter logic with core transformation functions.
 *
 * Core Functions:
 * - convertInstanaSpanToOTLP: Converts a single Instana span to OTLP format
 * - convertBatch: Converts multiple Instana spans with resourceSpans structure
 *
 * Helper functions are in transform-utils.js
 */

const { MAPPINGS, METADATA_MAPPINGS } = require('./mappers');
const {
  convertTraceId,
  convertSpanId,
  convertStartTime,
  convertEndTime,
  convertSpanKind,
  formatOTLPValue,
  getSpanType,
  applyMapping,
  applyMappingsForSpanType,
  generateSpanName,
  generateSpanStatus,
  StatusCode
} = require('./transform-utils');

// ============================================================================
// Span Data Conversion
// ============================================================================

/**
 * Converts Instana span data to OTLP attributes
 * Handles multiple data keys (e.g., mongo + peer)
 */
function convertSpanDataToOTLP(instanaSpan) {
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
function applyMetadataTransformations(instanaSpan) {
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
function createResourceAttributes(instanaSpan) {
  const attributes = [];

  // Service name
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
  const metadata = applyMetadataTransformations(instanaSpan);

  // Step 2: Convert span data to attributes
  const attributes = convertSpanDataToOTLP(instanaSpan);

  // Step 3: Create resource attributes
  const resourceAttributes = createResourceAttributes(instanaSpan);

  // Step 4: Assemble OTLP span (metadata already includes name and status)
  const otelSpan = {
    ...metadata,
    attributes,
    events: [],
    links: [],
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
 */
function convertBatch(instanaSpans) {
  if (!Array.isArray(instanaSpans)) {
    throw new Error('Input must be an array of spans');
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


/ ============================================================================
// Mapping Application Functions
// ============================================================================

/**
 * Applies a single mapping rule to span data
 */
function applyMapping(mapping, spanData) {
  let value;

  // Case 1: Static value
  if (mapping.value !== undefined && !mapping.instanaKey && !mapping.instanaKeys) {
    value = mapping.value;
  } else if (mapping.instanaKeys && Array.isArray(mapping.instanaKeys)) {
    // Case 2: Multi-field mapping
    if (mapping.transform) {
      value = mapping.transform(spanData, mapping.instanaKeys);
    } else {
      value = combineFields(spanData, mapping.instanaKeys);
    }
  } else if (mapping.instanaKey) {
    // Case 3: Single field with optional transform
    const rawValue = spanData[mapping.instanaKey];
    if (rawValue === undefined || rawValue === null) {
      return null;
    }
    value = mapping.transform ? mapping.transform(rawValue) : rawValue;
  } else {
    return null;
  }

  // Skip null/undefined values
  if (value === null || value === undefined) {
    return null;
  }

  // Return OTLP attribute format
  return {
    key: mapping.otlp,
    value: formatOTLPValue(value)
  };
}

/**
 * Applies all mappings for a specific span type
 */
function applyMappingsForSpanType(spanType, spanData) {
  const mappings = MAPPINGS[spanType];

  if (!mappings || !Array.isArray(mappings)) {
    return [];
  }

  const attributes = [];

  mappings.forEach(mapping => {
    const attribute = applyMapping(mapping, spanData);
    if (attribute) {
      attributes.push(attribute);
    }
  });

  return attributes;
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  // Main conversion functions
  convertInstanaSpanToOTLP,
  convertBatch,

  // Re-export utilities for convenience
  convertTraceId,
  convertSpanId,
  convertStartTime,
  convertEndTime,
  convertSpanKind,
  StatusCode
};

// Made with Bob
