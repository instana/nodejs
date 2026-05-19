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
  generateSpanName,
  convertStatus,
  toUpperCase,
  toInteger,
  applyMetadataTransformations,
  convertSpanData
} = require('./instana-to-otel-converter-utils');

// ============================================================================
// OTLP Mappings Configuration
// ============================================================================

/**
 * Metadata/Base field mappings for common span fields
 * Maps Instana span fields to OTLP span fields with value transformers
 *
 * Pattern: instanaField: { key: 'otelField', value: transformerFunction }
 */
const OTEL_METADATA_MAPPINGS = {
  t: { key: 'traceId', value: convertTraceId },
  s: { key: 'spanId', value: convertSpanId },
  p: { key: 'parentSpanId', value: convertSpanId },
  n: { key: 'name', value: generateSpanName },
  k: { key: 'kind', value: convertSpanKind },
  ts: { key: 'startTimeUnixNano', value: convertStartTime },
  d: { key: 'endTimeUnixNano', value: convertEndTime },
  ec: { key: 'status', value: convertStatus }
};

/**
 * Unified span type configuration with semantic convention mappings
 *
 * Each span type includes:
 * - mappings: Field name to OTLP attribute mappings with optional value transformers
 *   - key: The OTLP attribute name
 *   - value: Optional transformer function (value) => transformedValue
 * - prefix: Default prefix for unmapped fields
 * - additionalAttributes: Static attributes to add for this span type
 *
 * Based on OpenTelemetry Semantic Conventions:
 * - HTTP: https://opentelemetry.io/docs/specs/semconv/http/
 * - Messaging: https://opentelemetry.io/docs/specs/semconv/messaging/
 */
const OTEL_SPAN_ATTRIBUTE_MAPPINGS = {
  http: {
    mappings: {
      method: { key: 'http.request.method', value: toUpperCase },
      status: { key: 'http.response.status_code', value: toInteger },
      url: { key: 'url.full' },
      path: { key: 'url.path' },
      host: { key: 'server.address' },
      protocol: { key: 'network.protocol.name' },
      params: { key: 'url.query' },
      path_tpl: { key: 'url.template' },
      error: { key: 'error.type' },
      status_text: { key: 'http.status_text' },
      route: { key: 'http.route' },
      header: { key: 'http.request.header' },
      response_header: { key: 'http.response.header' }
    },
    prefix: 'http',
    additionalAttributes: {}
  },
  kafka: {
    mappings: {
      service: { key: 'messaging.destination.name' },
      access: { key: 'messaging.operation.type' },
      operation: { key: 'messaging.operation.type' },
      topic: { key: 'messaging.destination.name' },
      partition: { key: 'messaging.kafka.destination.partition', value: toInteger },
      offset: { key: 'messaging.kafka.message.offset', value: toInteger },
      key: { key: 'messaging.kafka.message.key' },
      group: { key: 'messaging.consumer.group.name' }
    },
    prefix: 'messaging.kafka',
    additionalAttributes: {
      'messaging.system': 'kafka'
    }
  }
};

// ============================================================================
// Core Conversion Functions
// ============================================================================

/**
 * Converts an Instana span to OpenTelemetry format using metadata mappings
 *
 * @param {Object} instanaSpan - The Instana span object
 * @returns {Object} OpenTelemetry formatted span
 */
function convertInstanaToOtel(instanaSpan) {
  if (!instanaSpan || typeof instanaSpan !== 'object') {
    throw new Error('Invalid Instana span: must be an object');
  }

  // Create base OTEL span structure using metadata mappings
  const otelSpan = {
    attributes: {},
    events: [],
    links: [],
    resource: {
      attributes: createResourceAttributes(instanaSpan)
    }
  };

  // Apply all metadata transformations in one call
  Object.assign(otelSpan, applyMetadataTransformations(instanaSpan, OTEL_METADATA_MAPPINGS));

  // Convert span data and error information to OTLP attributes
  otelSpan.attributes = convertSpanData(instanaSpan, OTEL_SPAN_ATTRIBUTE_MAPPINGS);

  // Clean up undefined values
  Object.keys(otelSpan).forEach(key => {
    if (otelSpan[key] === undefined) {
      delete otelSpan[key];
    }
  });

  return otelSpan;
}

/**
 * Creates resource attributes for OTLP format as an array
 *
 * @param {Object} instanaSpan - The Instana span object
 * @returns {Array} Resource attributes array
 */
function createResourceAttributes(instanaSpan) {
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
  OTEL_METADATA_MAPPINGS,
  OTEL_SPAN_ATTRIBUTE_MAPPINGS
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Made with Bob
