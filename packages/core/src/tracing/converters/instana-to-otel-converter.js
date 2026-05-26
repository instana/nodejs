/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/* eslint-disable no-console */

/**
 * Standalone Script: Instana Span to OpenTelemetry Span Converter
 *
 * This script converts Instana spans to OpenTelemetry format with proper
 * semantic conventions for HTTP and Kafka spans.
 *
 * Usage:
 *   node instana-to-otel-converter.js <input-file.json> [output-file.json]
 *
 * Or use programmatically:
 *   const { convertInstanaToOtel } = require('./instana-to-otel-converter');
 *   const otelSpan = convertInstanaToOtel(instanaSpan);
 */

const fs = require('fs');
const {
  convertTraceId,
  convertSpanId,
  convertStartTime,
  convertEndTime,
  convertSpanKind,
  applyMetadataTransformations,
  convertSpanData
} = require('./instana-to-otel-converter-utils');

const { getTransformer } = require('./transformers');

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {import('./otel-span').OtelSpan} OtelSpan
 * @typedef {import('./otel-span').OtelAttribute} OtelAttribute
 */

// ============================================================================
// OTLP Mappings Configuration
// ============================================================================

/**
 * Metadata/Base field mappings for common span fields
 * Maps Instana span fields to OTLP span fields with value transformers
 *
 * Pattern:
 * - instanaField: { key: 'otelField', value: transformerFunction }
 * - For transformer methods: { key: 'otelField', getter: 'methodName' }
 */
const OTEL_METADATA_MAPPINGS = {
  t: { key: 'traceId', value: convertTraceId },
  s: { key: 'spanId', value: convertSpanId },
  p: { key: 'parentSpanId', value: convertSpanId },
  k: { key: 'kind', value: convertSpanKind },
  ts: { key: 'startTimeUnixNano', value: convertStartTime },
  d: { key: 'endTimeUnixNano', value: convertEndTime },
  // Transformer-based fields (require transformer context)
  name: { key: 'name', getter: 'getSpanName' },
  status: { key: 'status', getter: 'getStatus' }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Builds data mappings for all keys in span.data
 *
 * This function handles the complex case where Instana spans contain multiple
 * data keys (e.g., MongoDB spans with both 'mongo' and 'peer' data). It ensures
 * that all data sections are properly mapped to OTLP attributes.
 *
 * Processing Steps:
 * 1. Add mappings from the primary transformer (e.g., MongoTransformer for 'mongo' data)
 * 2. Scan for additional data keys (e.g., 'peer')
 * 3. Add mappings for auxiliary data keys if available in SPAN_ATTRIBUTE_MAPPINGS
 * 4. Return complete mapping configuration for all data sections
 *
 * @param {import('../../core').InstanaBaseSpan} instanaSpan - The Instana span object
 * @param {Object} transformer - The transformer instance for the primary span type
 * @param {string} transformer.spanType - The primary span type (e.g., 'mongo', 'http')
 * @param {Function} transformer.data - Method to get data mappings
 * @returns {Object.<string, Object>} Data mappings configuration for all span data keys
 *
 * @example
 * // MongoDB span with peer data
 * const span = {
 *   data: {
 *     mongo: { command: 'find', service: '127.0.0.1:27017' },
 *     peer: { hostname: '127.0.0.1', port: 27017 }
 *   }
 * };
 * const transformer = new MongoTransformer(span);
 * const mappings = buildDataMappings(span, transformer);
 * // Returns:
 * // {
 * //   mongo: { mappings: {...}, prefix: 'db.mongodb', additionalAttributes: {...} },
 * //   peer: { mappings: {...}, prefix: 'peer', additionalAttributes: {} }
 * // }
 *
 * @example
 * // HTTP span (single data key)
 * const span = {
 *   data: {
 *     http: { method: 'GET', url: '/api/users' }
 *   }
 * };
 * const transformer = new HttpTransformer(span);
 * const mappings = buildDataMappings(span, transformer);
 * // Returns:
 * // {
 * //   http: { mappings: {...}, prefix: 'http', additionalAttributes: {} }
 * // }
 */
function buildDataMappings(instanaSpan, transformer) {
  /** @type {Object.<string, Object>} */
  const dataMappings = {};

  // Validate input
  if (!instanaSpan.data) {
    return dataMappings;
  }

  // Step 1: Add primary transformer's mappings
  if (transformer.spanType) {
    dataMappings[transformer.spanType] = transformer.data();
  }

  // Step 2: Process additional data keys using getTransformer
  Object.keys(instanaSpan.data).forEach(dataKey => {
    // Skip if we already have mappings for this key
    if (dataMappings[dataKey]) {
      return;
    }

    // Step 3: Create a temporary span with only this data key to get its transformer
    const tempSpan = {
      n: instanaSpan.n || 'unknown',
      data: { [dataKey]: instanaSpan.data[dataKey] }
    };

    // Get transformer for this specific data key
    const auxiliaryTransformer = getTransformer(tempSpan);

    // Only add mappings if we got a transformer with a valid spanType
    if (auxiliaryTransformer.spanType && auxiliaryTransformer.spanType !== 'unknown') {
      dataMappings[dataKey] = auxiliaryTransformer.data();
    }
  });

  return dataMappings;
}

// ============================================================================
// Core Conversion Functions
// ============================================================================

/**
 * Converts an Instana span to OpenTelemetry format using transformer pattern
 *
 * @param {import('../../core').InstanaBaseSpan} instanaSpan - The Instana span object
 * @returns {OtelSpan} OpenTelemetry formatted span
 */
function convertInstanaToOtel(instanaSpan) {
  if (!instanaSpan || typeof instanaSpan !== 'object') {
    throw new Error('Invalid Instana span: must be an object');
  }

  // Get the appropriate transformer for this span
  // @ts-ignore - InstanaBaseSpan is compatible with transformer input
  const transformer = getTransformer(instanaSpan);

  // Create base OTEL span structure using metadata mappings
  /** @type {OtelSpan} */
  const otelSpan = {
    // @ts-ignore - attributes will be populated by convertSpanData
    attributes: {},
    events: [],
    links: [],
    resource: {
      attributes: createResourceAttributes(instanaSpan)
    }
  };

  // Apply all metadata transformations in one call, including name and status via transformer
  Object.assign(otelSpan, applyMetadataTransformations(instanaSpan, OTEL_METADATA_MAPPINGS, transformer));

  // Get data mappings from transformer and convert span data
  // Build mappings for ALL data keys in the span, not just the primary one
  const dataMappings = buildDataMappings(instanaSpan, transformer);

  // Convert span data and error information to OTLP attributes
  // @ts-ignore - convertSpanData returns the correct type
  otelSpan.attributes = convertSpanData(instanaSpan, dataMappings, transformer);

  // Clean up undefined values
  Object.keys(otelSpan).forEach(key => {
    // @ts-ignore - dynamic key access for cleanup
    if (otelSpan[key] === undefined) {
      // @ts-ignore - dynamic key access for cleanup
      delete otelSpan[key];
    }
  });

  return otelSpan;
}

// Note: getSpanType is now imported from transformers.js
// It dynamically detects span types based on TRANSFORMER_REGISTRY

/**
 * Creates resource attributes for OTLP format as an array
 *
 * @param {import('../../core').InstanaBaseSpan} instanaSpan - The Instana span object
 * @returns {Array<OtelAttribute>} Resource attributes array
 */
function createResourceAttributes(instanaSpan) {
  /** @type {Array<OtelAttribute>} */
  const attributes = [];

  // Service name from span data
  const serviceName =
    instanaSpan.data?.service || process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'unknown-service';

  attributes.push({
    key: 'service.name',
    value: { stringValue: serviceName }
  });

  // SDK information
  attributes.push({
    key: 'telemetry.sdk.language',
    value: { stringValue: 'nodejs' }
  });

  attributes.push({
    key: 'telemetry.sdk.name',
    value: { stringValue: '@instana/collector' }
  });

  attributes.push({
    key: 'telemetry.sdk.version',
    value: { stringValue: '3.0.0' }
  });

  return attributes;
}

// ============================================================================
// Batch Conversion
// ============================================================================

/**
 * Converts multiple Instana spans to OTLP format with resourceSpans structure
 *
 * @param {Array<Object>} instanaSpans - Array of Instana spans
 * @returns {Object} OTLP traces object with resourceSpans
 */
function convertBatch(instanaSpans) {
  if (!Array.isArray(instanaSpans)) {
    throw new Error('Input must be an array of spans');
  }

  if (instanaSpans.length === 0) {
    return {
      resourceSpans: []
    };
  }

  // Convert all spans
  const otelSpans = instanaSpans
    .map(span => {
      try {
        return convertInstanaToOtel(span);
      } catch (error) {
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

    // Remove resource from individual span (it's at resourceSpans level)
    const { resource, ...spanWithoutResource } = otelSpan;
    spansByResource.get(resourceKey).spans.push(spanWithoutResource);
  });

  // Create OTLP ResourceSpans structure
  const resourceSpans = Array.from(spansByResource.values()).map(group => {
    return {
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
    };
  });

  return {
    resourceSpans: resourceSpans
  };
}

// ============================================================================
// CLI Interface
// ============================================================================

/**
 * Main CLI function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Instana to OpenTelemetry Span Converter

Usage:
  node instana-to-otel-converter.js <input-file.json> [output-file.json]
  
Arguments:
  input-file.json   - JSON file containing Instana span(s)
  output-file.json  - Optional output file (defaults to stdout)
  
Input Format:
  - Single span object: { t: "...", s: "...", ... }
  - Array of spans: [{ t: "...", s: "..." }, ...]
  
Examples:
  node instana-to-otel-converter.js instana-span.json
  node instana-to-otel-converter.js instana-spans.json otel-spans.json
  node instana-to-otel-converter.js input.json > output.json
    `);
    process.exit(0);
  }

  const inputFile = args[0];
  const outputFile = args[1];

  // Read input file
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
  }

  let inputData;
  try {
    const fileContent = fs.readFileSync(inputFile, 'utf8');
    inputData = JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading input file: ${error.message}`);
    process.exit(1);
  }

  // Convert spans
  let outputData;
  try {
    if (Array.isArray(inputData)) {
      outputData = convertBatch(inputData);
    } else {
      outputData = convertInstanaToOtel(inputData);
    }
  } catch (error) {
    console.error(`Error converting spans: ${error.message}`);
    process.exit(1);
  }

  // Write output
  const outputJson = JSON.stringify(outputData, null, 2);

  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, outputJson, 'utf8');
      console.log(`✓ Converted ${Array.isArray(inputData) ? inputData.length : 1} span(s)`);
      console.log(`✓ Output written to: ${outputFile}`);
    } catch (error) {
      console.error(`Error writing output file: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log(outputJson);
  }
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  convertInstanaToOtel,
  convertBatch,
  OTEL_METADATA_MAPPINGS
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Made with Bob
