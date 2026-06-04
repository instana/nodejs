/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Transform Utility Functions for OTLP Conversion
 *
 * This module contains all helper functions used by the OTLP converter:
 * - ID and timestamp conversions
 * - Span kind conversions
 * - Value transformers
 * - OTLP formatting
 * - Span type detection
 * - Mapping application
 * - Span name generation
 * - Status generation
 */

const { MAPPINGS } = require('./mappers');

// ============================================================================
// ID and Timestamp Conversion Functions
// ============================================================================

/**
 * Converts Instana trace ID to OTLP format (32-character hex string)
 */
function convertTraceId(instanaTraceId) {
  if (!instanaTraceId) return null;
  return String(instanaTraceId).padStart(32, '0');
}

/**
 * Converts Instana span ID to OTLP format (16-character hex string)
 */
function convertSpanId(instanaSpanId) {
  if (!instanaSpanId) return null;
  return String(instanaSpanId).padStart(16, '0');
}

/**
 * Converts Instana timestamp to OTLP nanosecond format
 */
function convertTimestamp(timestamp, duration = 0) {
  if (!timestamp) return '0';
  const totalMs = timestamp + duration;
  return String(totalMs * 1000000); // Convert ms to ns
}

/**
 * Converts start timestamp to nanoseconds
 */
function convertStartTime(timestamp) {
  return convertTimestamp(timestamp, 0);
}

/**
 * Converts end timestamp to nanoseconds (start + duration)
 */
function convertEndTime(span) {
  return convertTimestamp(span.ts, span.d);
}

// ============================================================================
// Span Kind Conversion
// ============================================================================

const SpanKind = {
  UNSPECIFIED: 0,
  INTERNAL: 1,
  SERVER: 2,
  CLIENT: 3,
  PRODUCER: 4,
  CONSUMER: 5
};

/**
 * Determines OTLP span kind from Instana span
 * k=1: Entry/Server, k=2: Exit/Client, k=3: Internal
 */
function convertSpanKind(instanaSpanKind) {
  if (instanaSpanKind === 1) return SpanKind.SERVER;
  if (instanaSpanKind === 2) return SpanKind.CLIENT;
  if (instanaSpanKind === 3) return SpanKind.INTERNAL;
  return SpanKind.UNSPECIFIED;
}

// ============================================================================
// Status Code
// ============================================================================

const StatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2
};

// ============================================================================
// Value Transform Functions
// ============================================================================

/**
 * Converts value to uppercase string
 */
function toUpperCase(value) {
  return value ? String(value).toUpperCase() : null;
}

/**
 * Converts value to integer
 */
function toInteger(value) {
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

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
