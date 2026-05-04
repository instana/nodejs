/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * Simple converter from Instana span format to OTLP format
 * Only converts HTTP spans for now
 */

/**
 * Convert Instana span to OTLP format
 * @param {Object} span - Instana span
 * @returns {Object} OTLP span
 */
function convertToOTLP(span) {
  // Only convert HTTP spans
  if (span.n !== 'node.http.server' && span.n !== 'node.http.client') {
    return span; // Return as-is for non-HTTP spans
  }

  // Build OTLP span
  const otlpSpan = {
    traceId: span.t.padStart(32, '0'),
    spanId: span.s.padStart(16, '0'),
    name: span.n,
    kind: convertKind(span.k),
    startTimeUnixNano: String(span.ts * 1000000),
    endTimeUnixNano: String((span.ts + span.d) * 1000000),
    attributes: convertAttributes(span),
    status: convertStatus(span),
    events: [],
    links: []
  };

  // Add parent if exists
  if (span.p) {
    otlpSpan.parentSpanId = span.p.padStart(16, '0');
  }

  return otlpSpan;
}

/**
 * Convert span kind
 */
function convertKind(k) {
  const kinds = {
    1: 'SPAN_KIND_SERVER',
    2: 'SPAN_KIND_CLIENT',
    3: 'SPAN_KIND_INTERNAL'
  };
  return kinds[k] || 'SPAN_KIND_INTERNAL';
}

/**
 * Convert attributes
 */
function convertAttributes(span) {
  const attributes = [];

  // Add HTTP-specific attributes with correct mappings
  if (span.data && span.data.http) {
    const http = span.data.http;

    if (http.method) {
      attributes.push({ key: 'http.method', value: { stringValue: http.method } });
    }

    // url → target
    if (http.url) {
      attributes.push({ key: 'http.target', value: { stringValue: http.url } });
    }

    // path_tps → route (same as url)
    if (http.path_tps) {
      attributes.push({ key: 'http.route', value: { stringValue: http.path_tps } });
    } else if (http.path) {
      attributes.push({ key: 'http.route', value: { stringValue: http.path } });
    }

    // status → status_code
    if (http.status) {
      attributes.push({ key: 'http.status_code', value: { intValue: String(http.status) } });
    }

    // host → host
    if (http.host) {
      attributes.push({ key: 'http.host', value: { stringValue: http.host } });
    }

    // Add status text if available
    if (http.status_text) {
      attributes.push({ key: 'http.status_text', value: { stringValue: http.status_text } });
    }

    // Add error message if available
    if (http.error) {
      attributes.push({ key: 'http.error', value: { stringValue: http.error } });
    }
  }

  // Add service name
  if (span.data && span.data.service) {
    attributes.push({ key: 'service.name', value: { stringValue: span.data.service } });
  }

  // Add all other data fields as attributes
  if (span.data) {
    Object.keys(span.data).forEach(key => {
      if (key !== 'http' && key !== 'service') {
        const value = span.data[key];
        if (value !== null && value !== undefined) {
          // Convert objects to JSON strings, primitives to strings
          const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          attributes.push({ key, value: { stringValue } });
        }
      }
    });
  }

  return attributes;
}

/**
 * Convert status
 */
function convertStatus(span) {
  // ec > 0 means error
  if (span.ec > 0) {
    return { code: 2 }; // ERROR
  }

  // Check HTTP status
  if (span.data && span.data.http && span.data.http.status) {
    const status = span.data.http.status;
    if (status >= 400) {
      return { code: 2 }; // ERROR
    }
    if (status >= 200 && status < 400) {
      return { code: 1 }; // OK
    }
  }

  return { code: 0 }; // UNSET
}

module.exports = { convertToOTLP };

// Made with Bob
