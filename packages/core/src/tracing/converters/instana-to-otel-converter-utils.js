/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Utility functions for Instana to OpenTelemetry span conversion
 */

// ============================================================================
// ID Conversion Functions
// ============================================================================

/**
 * Converts Instana trace ID to OTLP format (32-character hex string)
 *
 * @param {string} instanaTraceId - Instana trace ID (16-character hex)
 * @returns {string} OTLP trace ID (32-character hex)
 */
function convertTraceId(instanaTraceId) {
  if (!instanaTraceId) return '00000000000000000000000000000000';

  // Convert to string if not already
  const traceIdStr = String(instanaTraceId);
  return traceIdStr.padStart(32, '0');
}

/**
 * Converts Instana span ID to OTLP format (16-character hex string)
 *
 * @param {string} instanaSpanId - Instana span ID
 * @returns {string} OTLP span ID (16-character hex)
 */
function convertSpanId(instanaSpanId) {
  if (!instanaSpanId) return '0000000000000000';
  // Convert to string if not already
  const spanIdStr = String(instanaSpanId);
  return spanIdStr.padStart(16, '0');
}

// ============================================================================
// Timestamp Conversion Functions
// ============================================================================

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
 * Converts start timestamp to nanoseconds
 *
 * @param {number} timestamp - Instana timestamp in milliseconds
 * @returns {string} Timestamp in nanoseconds
 */
function convertStartTime(timestamp) {
  return convertTimestamp(timestamp, 0);
}

/**
 * Converts end timestamp to nanoseconds (start + duration)
 *
 * @param {Object} span - Instana span with ts and d fields
 * @returns {string} End timestamp in nanoseconds
 */
function convertEndTime(span) {
  return convertTimestamp(span.ts, span.d);
}

// ============================================================================
// Span Kind Conversion
// ============================================================================

/**
 * OTLP Span Kind enum values
 */
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
 *
 * @param {Object} instanaSpan - Instana span
 * @returns {number} OTLP span kind enum value
 */
function convertSpanKind(instanaSpanKind) {
  // Use Instana's span kind field (k) if available
  // k=1: Entry/Server span
  // k=2: Exit/Client span
  // k=3: Intermediate/Internal span (or undefined)
  if (instanaSpanKind === 1) {
    return SpanKind.SERVER;
  } else if (instanaSpanKind === 2) {
    return SpanKind.CLIENT;
  } else if (instanaSpanKind === 3) {
    return SpanKind.INTERNAL;
  }

  return SpanKind.UNSPECIFIED;
}

// ============================================================================
// Span Name Generation
// ============================================================================

/**
 * Generates OTLP span name from Instana span
 *
 * @param {Object} instanaSpan - Instana span
 * @returns {string} OTLP span name
 */
function generateSpanName(instanaSpan) {
  const spanName = instanaSpan.n;

  return spanName || 'unknown';
}

// ============================================================================
// Status Conversion
// ============================================================================

/**
 * OTLP Status Code enum values
 */
const StatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2
};

// ============================================================================
// Value Transformers
// ============================================================================

/**
 * Converts value to uppercase string
 */
function toUpperCase(value) {
  return value?.toUpperCase();
}

/**
 * Converts value to integer
 */
function toInteger(value) {
  return parseInt(value, 10);
}

/**
 * Identity transformer - returns value as-is
 */
function identity(value) {
  return value;
}

// ============================================================================
// Metadata Transformation
// ============================================================================

/**
 * Applies metadata transformations to convert Instana base fields to OTLP fields
 * Uses the metadata mappings configuration to transform all common span fields
 *
 * @param {Object} instanaSpan - The Instana span object
 * @param {Object} metadataMappings - Metadata mappings configuration
 * @param {Object} transformer - Optional transformer instance for getter-based mappings
 * @returns {Object} Object with transformed OTLP base fields
 */
function applyMetadataTransformations(instanaSpan, metadataMappings, transformer = null) {
  const result = {};

  Object.entries(metadataMappings).forEach(([instanaField, mapping]) => {
    // Handle getter-based mappings (require transformer context)
    if (mapping.getter) {
      if (transformer && typeof transformer[mapping.getter] === 'function') {
        const value = transformer[mapping.getter]();
        if (value !== null && value !== undefined) {
          result[mapping.key] = value;
        }
      }
      return;
    }

    const instanaValue = instanaSpan[instanaField];

    // Skip if the field doesn't exist in the instana span
    if (instanaValue === undefined && instanaField !== 'p') {
      return;
    }

    // Special handling for optional parent span ID
    if (instanaField === 'p' && !instanaValue) {
      return;
    }

    // Apply the transformation
    // Some transformers need the whole span (like generateSpanName, convertEndTime)
    // Others need just the value (like convertTraceId, convertSpanId)
    // Check the transformer function's expected parameters
    if (mapping.value) {
      const transformerName = mapping.value.name;

      // These functions need the entire span
      if (transformerName === 'generateSpanName' || transformerName === 'convertEndTime') {
        result[mapping.key] = mapping.value(instanaSpan);
      } else {
        // These functions need just the value
        result[mapping.key] = mapping.value(instanaValue);
      }
    }
  });

  return result;
}

// ============================================================================
// Span Data Conversion
// ============================================================================

/**
 * Converts Instana span data to OTLP attributes array based on span type
 *
 * @param {Object} instanaSpan - The complete Instana span object
 * @param {Object} spanAttributeMappings - Span attribute mappings configuration
 * @returns {Array} OTLP attributes array
 */
function convertSpanData(instanaSpan, spanAttributeMappings, transformer) {
  const attributes = [];
  const data = instanaSpan.data;

  // Process span data if present
  if (data) {
    // Dynamically process each span type using the unified configuration
    Object.keys(data).forEach(spanType => {
      const config = spanAttributeMappings[spanType];

      if (config && typeof data[spanType] === 'object') {
        // Process getter-based mappings from the mappings object
        Object.keys(config.mappings).forEach(key => {
          const mapping = config.mappings[key];

          // Handle getter-based mappings
          if (mapping && typeof mapping === 'object' && mapping.getter) {
            const getterName = mapping.getter;
            if (transformer && typeof transformer[getterName] === 'function') {
              const value = transformer[getterName]();
              if (value !== null && value !== undefined) {
                attributes.push({ key, value: { stringValue: String(value) } });
              }
            }
          }
        });

        // Process the span type data
        Object.keys(data[spanType]).forEach(key => {
          const mapping = config.mappings[key];
          const value = data[spanType][key];

          if (value === null || value === undefined) {
            return;
          }

          let otlpKey;
          let transformedValue = value;

          if (mapping) {
            // Handle getter-based mappings (skip, already processed above)
            if (typeof mapping === 'object' && mapping.getter) {
              return;
            }

            // Handle both old string format and new object format
            if (typeof mapping === 'string') {
              // Legacy format: direct string mapping
              otlpKey = mapping;
            } else if (typeof mapping === 'object' && mapping.key) {
              // New format: { key, value? }
              otlpKey = mapping.key;
              transformedValue = mapping.value ? mapping.value(value) : value;
            }
          } else {
            // Unmapped fields - skip prefix since we're removing it
            return;
          }

          // Add attribute with proper type
          if (typeof transformedValue === 'string') {
            attributes.push({ key: otlpKey, value: { stringValue: transformedValue } });
          } else if (typeof transformedValue === 'number') {
            attributes.push({ key: otlpKey, value: { intValue: transformedValue } });
          } else if (typeof transformedValue === 'boolean') {
            attributes.push({ key: otlpKey, value: { boolValue: transformedValue } });
          } else {
            attributes.push({ key: otlpKey, value: { stringValue: JSON.stringify(transformedValue) } });
          }
        });
      } else if (typeof data[spanType] !== 'object') {
        // Handle non-object fields directly
        const stringValue =
          typeof data[spanType] === 'object' ? JSON.stringify(data[spanType]) : String(data[spanType]);
        attributes.push({ key: spanType, value: { stringValue } });
      }
    });
  }

  return attributes;
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

  // Span name
  generateSpanName,

  // Status
  StatusCode,

  // Value transformers
  toUpperCase,
  toInteger,
  identity,

  // Metadata transformation
  applyMetadataTransformations,

  // Span data conversion
  convertSpanData
};

// Made with Bob
