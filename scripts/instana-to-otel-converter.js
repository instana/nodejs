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

// ============================================================================
// OTLP Attribute Mappings Configuration
// ============================================================================

/**
 * Unified span type configuration with semantic convention mappings
 *
 * Each span type includes:
 * - mappings: Field name to OTLP attribute mappings
 * - prefix: Default prefix for unmapped fields
 * - additionalAttributes: Static attributes to add for this span type
 *
 * Based on OpenTelemetry Semantic Conventions:
 * - HTTP: https://opentelemetry.io/docs/specs/semconv/http/
 * - Messaging: https://opentelemetry.io/docs/specs/semconv/messaging/
 */
const OTEL_SPAN_TYPE_CONFIG = {
  http: {
    mappings: {
      method: 'http.request.method',
      status: 'http.response.status_code',
      url: 'url.full',
      path: 'url.path',
      host: 'server.address',
      protocol: 'network.protocol.name',
      params: 'url.query',
      path_tpl: 'url.template',
      error: 'error.type',
      status_text: 'http.status_text',
      route: 'http.route',
      header: 'http.request.header',
      response_header: 'http.response.header'
    },
    prefix: 'http',
    additionalAttributes: {}
  },
  kafka: {
    mappings: {
      service: 'messaging.destination.name',
      access: 'messaging.operation.type',
      operation: 'messaging.operation.type',
      topic: 'messaging.destination.name',
      partition: 'messaging.kafka.destination.partition',
      offset: 'messaging.kafka.message.offset',
      key: 'messaging.kafka.message.key',
      group: 'messaging.consumer.group.name'
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
 * Converts an Instana span to OpenTelemetry format
 *
 * @param {Object} instanaSpan - The Instana span object
 * @returns {Object} OpenTelemetry formatted span
 */
function convertInstanaToOtel(instanaSpan) {
  if (!instanaSpan || typeof instanaSpan !== 'object') {
    throw new Error('Invalid Instana span: must be an object');
  }

  // Create base OTEL span structure
  const otelSpan = {
    traceId: convertTraceId(instanaSpan.t),
    spanId: convertSpanId(instanaSpan.s),
    parentSpanId: instanaSpan.p ? convertSpanId(instanaSpan.p) : undefined,
    name: generateSpanName(instanaSpan),
    kind: determineSpanKind(instanaSpan),
    startTimeUnixNano: convertTimestamp(instanaSpan.ts),
    endTimeUnixNano: convertTimestamp(instanaSpan.ts, instanaSpan.d),
    attributes: {},
    status: determineStatus(instanaSpan),
    events: [],
    links: []
  };

  // Convert span data to OTLP attributes
  if (instanaSpan.data) {
    otelSpan.attributes = convertSpanData(instanaSpan.data);
  }

  // Service nam eis treated as a normal span attribute rather than a resource attribute
  // see: https://opentelemetry.io/docs/specs/semconv/registry/attributes/
  // This is also required in all spans, so we can keep this here IMO
  // Add service information
  if (instanaSpan.data?.service) {
    otelSpan.attributes['service.name'] = instanaSpan.data.service;
  }

  // Add error information if present
  if (instanaSpan.ec && instanaSpan.ec > 0) {
    otelSpan.attributes.error = true;
    otelSpan.attributes['error.count'] = instanaSpan.ec;
  }

  // Clean up undefined values
  Object.keys(otelSpan).forEach(key => {
    if (otelSpan[key] === undefined) {
      delete otelSpan[key];
    }
  });

  return otelSpan;
}

/**
 * Converts Instana span data to OTLP attributes based on span type
 *
 * @param {Object} data - Instana span data object
 * @returns {Object} OTLP attributes
 */
function convertSpanData(data) {
  const attributes = {};

  // Dynamically process each span type using the unified configuration
  Object.keys(data).forEach(spanType => {
    const config = OTEL_SPAN_TYPE_CONFIG[spanType];

    if (config && typeof data[spanType] === 'object') {
      // Add any additional attributes for this span type
      Object.assign(attributes, config.additionalAttributes);

      // Process the span type data
      Object.keys(data[spanType]).forEach(key => {
        const otelKey = config.mappings[key];

        if (otelKey) {
          attributes[otelKey] = data[spanType][key];
        } else {
          // Unmapped fields get prefixed
          attributes[`${config.prefix}.${key}`] = data[spanType][key];
        }
      });
    } else if (typeof data[spanType] !== 'object') {
      // Handle non-object fields directly
      attributes[spanType] = data[spanType];
    }
  });

  return attributes;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts Instana trace ID to OTLP format (32-character hex string)
 *
 * @param {string} instanaTraceId - Instana trace ID (16-character hex)
 * @returns {string} OTLP trace ID (32-character hex)
 */
function convertTraceId(instanaTraceId) {
  if (!instanaTraceId) return '00000000000000000000000000000000';

  // Pad to 32 characters if needed
  return instanaTraceId.padStart(32, '0');
}

/**
 * Converts Instana span ID to OTLP format (16-character hex string)
 *
 * @param {string} instanaSpanId - Instana span ID
 * @returns {string} OTLP span ID (16-character hex)
 */
function convertSpanId(instanaSpanId) {
  if (!instanaSpanId) return '0000000000000000';

  // Pad to 16 characters if needed
  return instanaSpanId.padStart(16, '0');
}

/**
 * Converts Instana timestamp to OTLP nanosecond format
 *
 * @param {number} timestamp - Instana timestamp in milliseconds
 * @param {number} duration - Optional duration in milliseconds
 * @returns {string} Timestamp in nanoseconds
 */
function convertTimestamp(timestamp, duration = 0) {
  if (!timestamp) return '0';

  const totalMs = timestamp + duration;
  return String(totalMs * 1000000); // Convert ms to ns
}

/**
 * Generates OTLP span name from Instana span
 *
 * @param {Object} instanaSpan - Instana span
 * @returns {string} OTLP span name
 */
function generateSpanName(instanaSpan) {
  const spanName = instanaSpan.n;

  // For HTTP spans, use method + path if available
  if (instanaSpan.data?.http) {
    const method = instanaSpan.data.http.method || 'HTTP';
    const httpPath = instanaSpan.data.http.path || instanaSpan.data.http.url || '/';
    return `${method} ${httpPath}`;
  }

  // For Kafka spans, use operation + topic
  if (instanaSpan.data?.kafka) {
    const operation = instanaSpan.data.kafka.access || instanaSpan.data.kafka.operation || 'kafka';
    const topic = instanaSpan.data.kafka.service || instanaSpan.data.kafka.topic || 'unknown';
    return `${operation} ${topic}`;
  }

  return spanName || 'unknown';
}

/**
 * Determines OTLP span kind from Instana span
 *
 * @param {Object} instanaSpan - Instana span
 * @returns {number} OTLP span kind enum value
 */
function determineSpanKind(instanaSpan) {
  // OTLP Span Kind enum values
  const SpanKind = {
    UNSPECIFIED: 0,
    INTERNAL: 1,
    SERVER: 2,
    CLIENT: 3,
    PRODUCER: 4,
    CONSUMER: 5
  };

  // Use Instana's span kind field (k) if available
  // k=1: Entry/Server span
  // k=2: Exit/Client span
  // k=3: Intermediate/Internal span (or undefined)
  if (instanaSpan.k === 1) {
    return SpanKind.SERVER;
  } else if (instanaSpan.k === 2) {
    return SpanKind.CLIENT;
  } else if (instanaSpan.k === 3) {
    return SpanKind.INTERNAL;
  }

  // Kafka is a special case, Event if the following code is not there, it will get mapped to entry/exit by above logic
  // Fallback to span data for more specific kinds (Producer/Consumer)
  // Kafka Producer
  if (instanaSpan.data?.kafka?.access === 'send' || instanaSpan.data?.kafka?.access === 'produce') {
    return SpanKind.PRODUCER;
  }

  // Kafka Consumer
  if (instanaSpan.data?.kafka?.access === 'consume' || instanaSpan.data?.kafka?.access === 'receive') {
    return SpanKind.CONSUMER;
  }

  return SpanKind.EXIT;
}

/**
 * Determines OTLP status from Instana span
 *
 * @param {Object} instanaSpan - Instana span
 * @returns {Object} OTLP status object
 */
function determineStatus(instanaSpan) {
  // OTLP Status Code enum values
  const StatusCode = {
    UNSET: 0,
    OK: 1,
    ERROR: 2
  };

  const status = {
    code: StatusCode.UNSET
  };

  // Check for errors
  if (instanaSpan.ec && instanaSpan.ec > 0) {
    status.code = StatusCode.ERROR;
    status.message = instanaSpan.data?.http?.error || instanaSpan.data?.kafka?.error || 'Error occurred';
  } else if (instanaSpan.data?.http?.status) {
    const httpStatus = instanaSpan.data.http.status;
    if (httpStatus >= 400) {
      status.code = StatusCode.ERROR;
      status.message = `HTTP ${httpStatus}`;
    } else if (httpStatus >= 200 && httpStatus < 300) {
      status.code = StatusCode.OK;
    }
  } else {
    status.code = StatusCode.OK;
  }

  return status;
}

// ============================================================================
// Batch Conversion
// ============================================================================

/**
 * Converts multiple Instana spans to OTLP format
 *
 * @param {Array<Object>} instanaSpans - Array of Instana spans
 * @returns {Array<Object>} Array of OTLP spans
 */
function convertBatch(instanaSpans) {
  if (!Array.isArray(instanaSpans)) {
    throw new Error('Input must be an array of spans');
  }

  return instanaSpans
    .map(span => {
      try {
        return convertInstanaToOtel(span);
      } catch (error) {
        console.error(`Error converting span: ${error.message}`);
        return null;
      }
    })
    .filter(span => span !== null);
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
  convertSpanData,
  OTEL_SPAN_TYPE_CONFIG
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Made with Bob
