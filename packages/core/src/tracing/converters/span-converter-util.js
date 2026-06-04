/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Unified Function-Based Span Converter
 *
 * This module combines the functionality of:
 * - otel-map-functions.js (OTLP mapping with pure functions)
 * - instana-to-otel-converter-utils.js (ID/timestamp conversion utilities)
 * - transformers.js (protocol-specific logic, now as pure functions)
 *
 * Design Philosophy:
 * - Pure functions instead of classes
 * - Composition over inheritance
 * - Data-driven configuration from otlp-mapper.js
 * - No side effects, easier to test and reason about
 */

const { MAPPINGS, METADATA_MAPPINGS } = require('./otlp-mapper');
const {
  convertTraceId,
  convertSpanId,
  convertTimestamp,
  convertStartTime,
  convertEndTime,
  convertSpanKind,
  toUpperCase,
  toInteger,
  SpanKind
} = require('./transform-functions');

// ============================================================================
// Status Conversion
// ============================================================================

const StatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2
};

/**
 * Combines host and port into address string
 */
function combineHostPort(data, keys) {
  const [hostKey, portKey] = keys;
  const host = data[hostKey];
  const port = data[portKey];
  if (!host) return null;
  return port ? `${host}:${port}` : host;
}

/**
 * Generic multi-field combiner with custom separator
 */
function combineFields(data, keys, separator = ':') {
  const values = keys.map(key => data[key]).filter(v => v !== null && v !== undefined);
  return values.length > 0 ? values.join(separator) : null;
}

// ============================================================================
// OTLP Value Formatting
// ============================================================================

/**
 * Formats a value into OTLP attribute value format
 */
function formatOTLPValue(value) {
  if (typeof value === 'string') {
    return { stringValue: value };
  } else if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { intValue: value };
    }
    return { doubleValue: value };
  } else if (typeof value === 'boolean') {
    return { boolValue: value };
  } else if (typeof value === 'object' && value !== null) {
    return { stringValue: JSON.stringify(value) };
  }
  return { stringValue: String(value) };
}

// ============================================================================
// Span Type Detection
// ============================================================================

/**
 * Priority order for span type selection when multiple data keys exist
 */
const SPAN_TYPE_PRIORITY = [
  'http',
  'kafka',
  'rabbitmq',
  'sqs',
  'sns',
  'nats',
  'bull',
  'gcps',
  'pg',
  'mysql',
  'mssql',
  'mongo',
  'redis',
  'couchbase',
  'elasticsearch',
  'dynamodb',
  'db2',
  'memcached',
  'rpc',
  'graphql',
  'gcs',
  's3',
  'kinesis',
  'azstorage',
  'aws.lambda.invoke',
  'peer'
];

/**
 * Determines the primary span type from span data
 */
function getSpanType(instanaSpan) {
  if (!instanaSpan?.data) return null;

  const dataKeys = Object.keys(instanaSpan.data);

  // Find first matching type in priority order
  const matchedType = SPAN_TYPE_PRIORITY.find(type => dataKeys.includes(type));

  if (matchedType) return matchedType;

  // Fallback to first available key
  return dataKeys[0] || null;
}

// ============================================================================
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
// Span Name Generation Functions
// ============================================================================

/**
 * System name mappings for different span types
 */
const SYSTEM_NAMES = {
  kafka: 'kafka',
  rabbitmq: 'rabbitmq',
  mongo: 'mongodb',
  pg: 'postgresql',
  mysql: 'mysql',
  mssql: 'mssql',
  redis: 'redis',
  couchbase: 'couchbase',
  elasticsearch: 'elasticsearch',
  dynamodb: 'dynamodb',
  db2: 'db2',
  memcached: 'memcached'
};

/**
 * Generates span name for HTTP spans
 */
function generateHttpSpanName(data) {
  const method = data.method || data.operation || 'HTTP';
  const path = data.path || data.url || '/';
  return `${method.toUpperCase()} ${path}`;
}

/**
 * Generates span name for messaging spans
 */
function generateMessagingSpanName(data) {
  const operation = data.operation || data.access || data.sort || 'messaging';
  const destination = data.service || data.topic || data.queue || data.subject || 'unknown';
  return `${operation} ${destination}`;
}

/**
 * Generates span name for database spans
 */
function generateDatabaseSpanName(spanType, data) {
  const operation = data.command || data.operation || data.action || 'query';
  const systemName = SYSTEM_NAMES[spanType] || spanType;
  return `${systemName}.${operation}`;
}

/**
 * Generates OTLP span name based on span type and data
 */
function generateSpanName(instanaSpan) {
  const spanType = getSpanType(instanaSpan);
  const data = instanaSpan.data?.[spanType];

  if (!data) {
    return instanaSpan.n || 'unknown';
  }

  // HTTP spans
  if (spanType === 'http') {
    return generateHttpSpanName(data);
  }

  // Messaging spans
  if (['kafka', 'rabbitmq', 'sqs', 'sns', 'nats', 'bull', 'gcps'].includes(spanType)) {
    return generateMessagingSpanName(data);
  }

  // Database spans
  if (
    ['pg', 'mysql', 'mssql', 'mongo', 'redis', 'couchbase', 'elasticsearch', 'dynamodb', 'db2', 'memcached'].includes(
      spanType
    )
  ) {
    return generateDatabaseSpanName(spanType, data);
  }

  // Default: use span name
  return instanaSpan.n || 'unknown';
}

// ============================================================================
// Status Generation Functions
// ============================================================================

/**
 * Generates status for HTTP spans
 */
function generateHttpStatus(span, data) {
  const status = { code: StatusCode.UNSET };

  // Check error count first
  if (span.ec && span.ec > 0) {
    status.code = StatusCode.ERROR;
    status.message = data.error || 'Error occurred';
  } else if (data.status) {
    const httpStatus = data.status;
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

/**
 * Generates status for messaging spans
 */
function generateMessagingStatus(span, data) {
  const status = { code: StatusCode.UNSET };

  if (span.ec && span.ec > 0) {
    status.code = StatusCode.ERROR;
    status.message = data.error || 'Messaging error occurred';
  } else {
    status.code = StatusCode.OK;
  }

  return status;
}

/**
 * Generates status for database spans
 */
function generateDatabaseStatus(span, data) {
  const status = { code: StatusCode.UNSET };

  if (span.ec && span.ec > 0) {
    status.code = StatusCode.ERROR;
    status.message = data.error || 'Database operation failed';
  } else {
    status.code = StatusCode.OK;
  }

  return status;
}

/**
 * Generates OTLP status based on span type and data
 */
function generateSpanStatus(instanaSpan) {
  const spanType = getSpanType(instanaSpan);
  const data = instanaSpan.data?.[spanType] || {};

  // HTTP spans
  if (spanType === 'http') {
    return generateHttpStatus(instanaSpan, data);
  }

  // Messaging spans
  if (['kafka', 'rabbitmq', 'sqs', 'sns', 'nats', 'bull', 'gcps'].includes(spanType)) {
    return generateMessagingStatus(instanaSpan, data);
  }

  // Database spans
  if (
    ['pg', 'mysql', 'mssql', 'mongo', 'redis', 'couchbase', 'elasticsearch', 'dynamodb', 'db2', 'memcached'].includes(
      spanType
    )
  ) {
    return generateDatabaseStatus(instanaSpan, data);
  }

  // Default status
  const status = { code: StatusCode.UNSET };
  if (instanaSpan.ec && instanaSpan.ec > 0) {
    status.code = StatusCode.ERROR;
    status.message = 'Error occurred';
  } else {
    status.code = StatusCode.OK;
  }

  return status;
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
  const serviceName =
    instanaSpan.data?.service || process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'unknown-service';

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
// Main Conversion Function
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

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  // ID conversions
  convertTraceId,
  convertSpanId,

  // Timestamp conversions
  convertTimestamp,
  convertStartTime,
  convertEndTime,

  // Span kind
  convertSpanKind,
  SpanKind,

  // Status
  StatusCode,

  // Value transformers
  toUpperCase,
  toInteger,
  combineHostPort,
  combineFields,

  // OTLP formatting
  formatOTLPValue,

  // Span type detection
  getSpanType,

  // Mapping application
  applyMapping,
  applyMappingsForSpanType,
  convertSpanDataToOTLP,

  // Span name generation
  generateSpanName,
  generateHttpSpanName,
  generateMessagingSpanName,
  generateDatabaseSpanName,

  // Status generation
  generateSpanStatus,
  generateHttpStatus,
  generateMessagingStatus,
  generateDatabaseStatus,

  // Metadata transformation
  applyMetadataTransformations,

  // Resource attributes
  createResourceAttributes,

  // Main conversion functions
  convertInstanaSpanToOTLP,
  convertBatch
};

// Made with Bob
