/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * OpenTelemetry Span Converter
 *
 * Converts Instana spans to OpenTelemetry format following semantic conventions v1.24.0
 *
 * @module tracing/converters/otel/OTelSpanConverter
 */

const SpanConverter = require('../SpanConverter');
const ConversionError = require('../ConversionError');
const { SpanFormat } = require('../types');

/**
 * Converter for transforming Instana spans to OpenTelemetry format
 *
 * @class OTelSpanConverter
 * @extends SpanConverter
 */
class OTelSpanConverter extends SpanConverter {
  /**
   * Create OTel span converter
   *
   * @param {Object} [config] - Converter configuration
   */
  constructor(config = {}) {
    super(config);
    this.semconvVersion = config.semconvVersion || '1.24.0';
  }

  /**
   * Get target format
   *
   * @returns {string} Target format name
   */
  getTargetFormat() {
    return SpanFormat.OPENTELEMETRY;
  }

  /**
   * Get format version
   *
   * @returns {string} Semantic conventions version
   */
  getFormatVersion() {
    return this.semconvVersion;
  }

  /**
   * Convert Instana span to OpenTelemetry format
   *
   * @param {*} span - Instana span
   * @returns {Object} Conversion result
   */
  convert(span) {
    const startTimeUs = process.hrtime.bigint();

    try {
      // Validate input
      const validation = this.validate(span);
      if (!validation.valid) {
        const endTimeUs = process.hrtime.bigint();
        const durationUs = Number(endTimeUs - startTimeUs) / 1000;
        this._updateStats(false, durationUs, 0);

        return {
          success: false,
          error: ConversionError.validationError(
            'Invalid Instana span',
            span && span.s ? span.s : 'unknown',
            validation.errors
          )
        };
      }

      // Convert to OTel format
      const otelSpan = this._convertToOTel(span);

      // Track success
      const endTimeUs = process.hrtime.bigint();
      const durationUs = Number(endTimeUs - startTimeUs) / 1000;
      this._updateStats(true, durationUs, 0);

      return {
        success: true,
        span: otelSpan
      };
    } catch (error) {
      const endTimeUs = process.hrtime.bigint();
      const durationUs = Number(endTimeUs - startTimeUs) / 1000;
      this._updateStats(false, durationUs, 0);

      return {
        success: false,
        error: ConversionError.transformationError(
          `Conversion failed: ${error.message}`,
          span && span.s ? span.s : 'unknown',
          error
        )
      };
    }
  }

  /**
   * Validate Instana span
   *
   * @param {*} span - Instana span
   * @returns {Object} Validation result
   */
  validate(span) {
    const errors = [];

    if (!span) {
      errors.push('Span is null or undefined');
      return { valid: false, errors };
    }

    if (!span.t) errors.push('Missing trace ID (t)');
    if (!span.s) errors.push('Missing span ID (s)');
    if (!span.n) errors.push('Missing span name (n)');
    if (typeof span.ts !== 'number') errors.push('Invalid timestamp (ts)');
    if (typeof span.d !== 'number') errors.push('Invalid duration (d)');

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert Instana span to OTel format
   *
   * @private
   * @param {*} span - Instana span
   * @returns {Object} OTel span
   */
  _convertToOTel(span) {
    return {
      // Core identifiers
      traceId: span.t,
      spanId: span.s,
      parentSpanId: span.p || undefined,
      traceFlags: span.tp ? 1 : 0, // 1 = sampled
      traceState: undefined,

      // Span metadata
      name: this._convertSpanName(span),
      kind: this._convertSpanKind(span.k),

      // Timing (convert ms to nanoseconds)
      startTimeUnixNano: span.ts * 1000000,
      endTimeUnixNano: (span.ts + span.d) * 1000000,

      // Attributes
      attributes: this._convertAttributes(span),
      droppedAttributesCount: 0,

      // Events
      events: [],
      droppedEventsCount: 0,

      // Links
      links: [],
      droppedLinksCount: 0,

      // Status
      status: this._convertStatus(span.ec),

      // Resource (service info)
      resource: this._convertResource(span)
    };
  }

  /**
   * Convert span name from Instana technical name to OTel semantic name
   *
   * @private
   * @param {*} span - Instana span
   * @returns {string} OTel span name
   */
  _convertSpanName(span) {
    // For HTTP spans, use method + path
    if (span.n === 'node.http.server' && span.data && span.data.http) {
      const method = span.data.http.method || 'HTTP';
      const path = span.data.http.url || span.data.http.path || '/';
      return `${method} ${path}`;
    }

    if (span.n === 'node.http.client' && span.data && span.data.http) {
      const method = span.data.http.method || 'HTTP';
      const url = span.data.http.url || '/';
      return `${method} ${url}`;
    }

    // For other spans, use the technical name for now
    return span.n;
  }

  /**
   * Convert span kind from Instana to OTel
   *
   * @private
   * @param {number} instanaKind - Instana kind (1=ENTRY, 2=EXIT, 3=INTERMEDIATE)
   * @returns {number} OTel kind
   */
  _convertSpanKind(instanaKind) {
    // OTel SpanKind: 0=INTERNAL, 1=SERVER, 2=CLIENT, 3=PRODUCER, 4=CONSUMER
    switch (instanaKind) {
      case 1: // ENTRY
        return 1; // SERVER
      case 2: // EXIT
        return 2; // CLIENT
      case 3: // INTERMEDIATE
      default:
        return 0; // INTERNAL
    }
  }

  /**
   * Convert span attributes
   *
   * @private
   * @param {*} span - Instana span
   * @returns {Object} OTel attributes
   */
  _convertAttributes(span) {
    const attributes = {};

    // HTTP attributes
    if (span.data && span.data.http) {
      const http = span.data.http;

      if (http.method) {
        attributes['http.request.method'] = http.method;
      }
      if (http.url) {
        attributes['url.full'] = http.url;
        attributes['url.path'] = http.url.split('?')[0];
      }
      if (http.status) {
        attributes['http.response.status_code'] = http.status;
      }
      if (http.host) {
        attributes['server.address'] = http.host.split(':')[0];
        const port = http.host.split(':')[1];
        if (port) {
          attributes['server.port'] = parseInt(port, 10);
        }
      }
    }

    // Add Instana-specific attributes for debugging
    attributes['instana.span.name'] = span.n;
    attributes['instana.span.kind'] = span.k;

    return attributes;
  }

  /**
   * Convert error count to OTel status
   *
   * @private
   * @param {number} errorCount - Instana error count
   * @returns {Object} OTel status
   */
  _convertStatus(errorCount) {
    // OTel StatusCode: 0=UNSET, 1=OK, 2=ERROR
    if (errorCount > 0) {
      return {
        code: 2, // ERROR
        message: `${errorCount} error(s) occurred`
      };
    }
    return {
      code: 1, // OK
      message: ''
    };
  }

  /**
   * Convert resource attributes
   *
   * @private
   * @param {*} span - Instana span
   * @returns {Object} OTel resource
   */
  _convertResource(span) {
    const resource = {
      attributes: {}
    };

    // Service information
    if (span.f) {
      if (span.f.e) {
        resource.attributes['service.instance.id'] = span.f.e;
      }
      if (span.f.h) {
        resource.attributes['host.name'] = span.f.h;
      }
    }

    return resource;
  }
}

module.exports = OTelSpanConverter;

// Made with Bob
