/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { getOtlpAttributeMappings } = require('./otlp_mapper/mapper');

// Cached Resource information for Metrics (when no "from" field is present)
let cachedHostId = null;
let cachedPid = null;

/**
 * Sets the Host-ID for Resource Attributes
 * @param {string} hostId - Host ID
 */
function setHostId(hostId) {
  cachedHostId = hostId;
}

/**
 * Sets the PID for Resource Attributes
 * @param {string|number} pid - Process ID
 */
function setPid(pid) {
  cachedPid = String(pid);
}

/**
 * Span kind mapping rules for special cases
 * Maps specific span types to OTEL span kinds based on data context
 */
const spanKindRules = {
  kafka: {
    dataKey: 'kafka',
    resolver: data => {
      // OTEL: 4=PRODUCER, 5=CONSUMER
      if (data.access === 'send') return 4;
      if (data.access === 'consume') return 5;
      return null; // Fall back to default mapping
    }
  }
};

/**
 * Converts Instana Span Kind to OTEL Span Kind
 * @param {number} instanaKind - Instana span kind (1=ENTRY, 2=EXIT, 3=INTERMEDIATE)
 * @param {string} spanType - Instana span type (e.g., 'node.http.server', 'kafka')
 * @param {Object} data - Span data for additional context
 * @returns {number} OTEL span kind
 */
function convertSpanKind(instanaKind, spanType, data) {
  // OTEL: 0=UNSPECIFIED, 1=INTERNAL, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER

  // Check for special span kind rules
  const rule = spanKindRules[spanType];
  if (rule && data && data[rule.dataKey]) {
    const resolvedKind = rule.resolver(data[rule.dataKey]);
    if (resolvedKind !== null) {
      return resolvedKind;
    }
  }

  // Standard Instana kind mapping
  switch (instanaKind) {
    case 1: // ENTRY -> SERVER
      return 2;
    case 2: // EXIT -> CLIENT
      return 3;
    case 3: // INTERMEDIATE -> INTERNAL
      return 1;
    default:
      return 0; // UNSPECIFIED
  }
}

/**
 * Converts milliseconds to nanoseconds (as String)
 * @param {number} ms - Milliseconds
 * @returns {string} Nanoseconds as String
 */
function msToNano(ms) {
  return String(ms * 1000000);
}

/**
 * System attribute rules for specific span types
 * Automatically adds required system attributes based on span type
 */
const systemAttributeRules = {
  postgres: {
    dataKey: 'pg',
    attributes: [{ key: 'db.system', value: 'postgresql' }]
  },
  kafka: {
    dataKey: 'kafka',
    attributes: [{ key: 'messaging.system', value: 'kafka' }]
  }
};

/**
 * Creates OTEL Attributes from Instana Span Data using mapper schema
 * @param {Object} data - Instana span data
 * @param {string} spanType - Instana span type for context-specific attributes
 * @returns {Array} OTEL attributes array
 */
function createAttributes(data, spanType) {
  const attributes = [];
  const mappings = getOtlpAttributeMappings();

  if (!data) {
    return attributes;
  }

  // Add system-specific attributes based on span type
  const systemRule = systemAttributeRules[spanType];
  if (systemRule && data[systemRule.dataKey]) {
    systemRule.attributes.forEach(attr => {
      attributes.push({ key: attr.key, value: { stringValue: attr.value } });
    });
  }

  // Process each data section (http, service, etc.)
  Object.keys(data).forEach(dataKey => {
    const dataSection = data[dataKey];
    const sectionMappings = mappings[dataKey];

    if (!sectionMappings || typeof dataSection !== 'object') {
      // If no mappings exist for this section, add as-is
      if (dataSection !== null && dataSection !== undefined) {
        const stringValue = typeof dataSection === 'object' ? JSON.stringify(dataSection) : String(dataSection);
        attributes.push({ key: dataKey, value: { stringValue } });
      }
      return;
    }

    // Apply mappings for this section
    Object.keys(dataSection).forEach(field => {
      const value = dataSection[field];
      if (value === null || value === undefined) {
        return;
      }

      const otlpKey = sectionMappings[field] || `${dataKey}.${field}`;

      // Determine value type and format
      if (otlpKey === 'http.response.status_code' && typeof value === 'number') {
        attributes.push({ key: otlpKey, value: { intValue: value } });
      } else if (typeof value === 'string') {
        attributes.push({ key: otlpKey, value: { stringValue: value } });
      } else if (typeof value === 'number') {
        attributes.push({ key: otlpKey, value: { intValue: value } });
      } else if (typeof value === 'boolean') {
        attributes.push({ key: otlpKey, value: { boolValue: value } });
      } else {
        // Convert objects to JSON strings
        attributes.push({ key: otlpKey, value: { stringValue: JSON.stringify(value) } });
      }
    });
  });

  return attributes;
}

/**
 * Creates Resource Attributes from Instana "from" field
 * @param {Object} from - Instana from object
 * @returns {Array} OTEL resource attributes
 */
function createResourceAttributes(from) {
  const attributes = [];

  // Standard OTEL Resource Attributes
  attributes.push({
    key: 'telemetry.sdk.language',
    value: { stringValue: 'nodejs' }
  });

  attributes.push({
    key: 'telemetry.sdk.name',
    value: { stringValue: '@instana/collector' }
  });

  // Service Name - use process.title or a default
  const serviceName = process.env.SERVICE_NAME;
  attributes.push({
    key: 'service.name',
    value: { stringValue: serviceName }
  });

  // Use "from" field if present, otherwise cached values
  const pid = from && from.e ? from.e : cachedPid;
  const hostId = from && from.h ? from.h : cachedHostId;

  // Process PID
  if (pid) {
    attributes.push({
      key: 'process.pid',
      value: { intValue: parseInt(pid, 10) }
    });
  }

  // Host Name
  if (hostId) {
    attributes.push({
      key: 'host.name',
      value: { stringValue: hostId }
    });
  }

  return attributes;
}

/**
 * Determines the status code based on Error Count
 * @param {number} errorCount - Instana error count
 * @returns {Object} OTEL status object
 */
function createStatus(errorCount) {
  // OTEL Status Code: 0=UNSET, 1=OK, 2=ERROR
  if (errorCount > 0) {
    return { code: 2 }; // ERROR
  }
  return { code: 1 }; // OK
}

/**
 * Span name generation rules configuration
 * Each rule defines how to generate a span name for a specific span type
 */
const spanNameRules = {
  'node.http.server': {
    dataKey: 'http',
    template: data => {
      const method = data.method || 'HTTP';
      const path = data.path_tpl || data.url || '/';
      return `${method} ${path}`;
    }
  },
  'node.http.client': {
    dataKey: 'http',
    template: data => data.method || 'HTTP'
  },
  postgres: {
    dataKey: 'pg',
    template: data => {
      const stmt = data.stmt || '';
      const operation = stmt.split(' ')[0] || 'query';
      const db = data.db || '';
      return `pg.query:${operation} ${db}`.trim();
    }
  },
  kafka: {
    dataKey: 'kafka',
    template: data => {
      const access = data.access || 'process';
      const topic = data.service || 'unknown';
      return `${access} ${topic}`;
    }
  }
};

/**
 * Generates a descriptive span name based on Instana span data
 * @param {Object} instanaSpan - Instana span object
 * @returns {string} Descriptive span name
 */
function generateSpanName(instanaSpan) {
  const spanType = instanaSpan.n;
  const data = instanaSpan.data || {};

  // Check if we have a rule for this span type
  const rule = spanNameRules[spanType];
  if (rule && data[rule.dataKey]) {
    return rule.template(data[rule.dataKey]);
  }

  // Default: use span type
  return spanType || 'unknown';
}

/**
 * Transforms a single Instana Span to OTEL Span
 * @param {Object} instanaSpan - Instana span object
 * @returns {Object} OTEL span object
 */
function transformSpan(instanaSpan) {
  // Validate required fields
  if (typeof instanaSpan.ts !== 'number' || typeof instanaSpan.d !== 'number') {
    // Return a minimal valid span if timestamps are missing
    return {
      traceId: normalizeTraceId(instanaSpan.t || '0'),
      spanId: instanaSpan.s || '0',
      name: generateSpanName(instanaSpan),
      kind: 0,
      startTimeUnixNano: '0',
      endTimeUnixNano: '0',
      attributes: [],
      status: { code: 1 }
    };
  }

  const otelSpan = {
    traceId: normalizeTraceId(instanaSpan.t),
    spanId: instanaSpan.s,
    name: generateSpanName(instanaSpan),
    kind: convertSpanKind(instanaSpan.k, instanaSpan.n, instanaSpan.data),
    startTimeUnixNano: msToNano(instanaSpan.ts),
    endTimeUnixNano: msToNano(instanaSpan.ts + instanaSpan.d),
    attributes: createAttributes(instanaSpan.data, instanaSpan.n),
    status: createStatus(instanaSpan.ec || 0)
  };

  // Parent Span ID is optional
  if (instanaSpan.p) {
    otelSpan.parentSpanId = instanaSpan.p;
  }

  return otelSpan;
}

function normalizeTraceId(traceId) {
  const normalized = String(traceId || '0');
  if (normalized.length === 32) {
    return normalized;
  }
  if (normalized.length > 32) {
    return normalized.slice(-32);
  }
  return normalized.padStart(32, '0');
}

/**
 * Transforms Instana Traces to OTEL Format
 * Similar to the transform pattern in mapper.js, this function processes
 * Instana spans and converts them to OpenTelemetry format.
 *
 * @param {Array} instanaTraces - Array of Instana spans
 * @returns {Object} OTEL traces object
 */
function transform(instanaTraces) {
  if (!Array.isArray(instanaTraces) || instanaTraces.length === 0) {
    return {
      resourceSpans: []
    };
  }

  // Group Spans by Resource (from field)
  const spansByResource = new Map();

  instanaTraces.forEach(function (instanaSpan) {
    // Cache PID and Host-ID from the first span for Metrics
    if (instanaSpan.f) {
      if (instanaSpan.f.e && !cachedPid) {
        setPid(instanaSpan.f.e);
      }
      if (instanaSpan.f.h && !cachedHostId) {
        setHostId(instanaSpan.f.h);
      }
    }

    const resourceKey = JSON.stringify(instanaSpan.f || {});

    if (!spansByResource.has(resourceKey)) {
      spansByResource.set(resourceKey, {
        resource: instanaSpan.f,
        spans: []
      });
    }

    spansByResource.get(resourceKey).spans.push(instanaSpan);
  });

  // Create OTEL ResourceSpans
  const resourceSpans = Array.from(spansByResource.values()).map(function (group) {
    const otelSpans = group.spans.map(transformSpan);

    console.log('-----------------', JSON.stringify(otelSpans));

    return {
      resource: {
        attributes: createResourceAttributes(group.resource)
      },
      scopeSpans: [
        {
          scope: {
            name: '@instana/collector',
            version: '1.0.0'
          },
          spans: otelSpans
        }
      ]
    };
  });

  return {
    resourceSpans: resourceSpans
  };
}

/**
 * Flattens nested objects to a flat object with dot notation
 * @param {Object} obj - Nested object
 * @param {string} prefix - Prefix for the keys
 * @returns {Object} Flat object
 */
function flattenObject(obj, prefix) {
  prefix = prefix || '';
  const flattened = {};

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) {
      continue;
    }

    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      const nested = flattenObject(value, newKey);
      for (const nestedKey in nested) {
        if (nested.hasOwnProperty(nestedKey)) {
          flattened[nestedKey] = nested[nestedKey];
        }
      }
    } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      // Only take primitive values
      flattened[newKey] = value;
    }
  }

  return flattened;
}

/**
 * Transforms Instana Metrics to OTEL Format
 * @param {Array|Object} instanaMetrics - Array or object of Instana metrics
 * @returns {Object} OTEL metrics object
 */
function transformMetrics(instanaMetrics) {
  // If it's an object, convert the values to an array
  let metricsArray = instanaMetrics;

  if (!Array.isArray(instanaMetrics)) {
    if (!instanaMetrics || typeof instanaMetrics !== 'object') {
      return {
        resourceMetrics: []
      };
    }

    // Flatten the nested object
    const flattenedMetrics = flattenObject(instanaMetrics);

    // Convert flat object to array of Metrics
    metricsArray = Object.keys(flattenedMetrics).map(function (key) {
      const value = flattenedMetrics[key];
      return {
        name: key,
        value: value,
        timestamp: Date.now(),
        unit: '',
        from: instanaMetrics.from
      };
    });
  }

  if (metricsArray.length === 0) {
    return {
      resourceMetrics: []
    };
  }

  // Group Metrics by Resource
  const metricsByResource = new Map();

  metricsArray.forEach(function (instanaMetric) {
    const resourceKey = JSON.stringify(instanaMetric.from || {});

    if (!metricsByResource.has(resourceKey)) {
      metricsByResource.set(resourceKey, {
        resource: instanaMetric.from,
        metrics: []
      });
    }

    metricsByResource.get(resourceKey).metrics.push(instanaMetric);
  });

  // Create OTEL ResourceMetrics
  const resourceMetrics = Array.from(metricsByResource.values()).map(function (group) {
    const otelMetrics = group.metrics.map(function (metric) {
      // Determine the metric type based on the value
      let metricData;
      if (typeof metric.value === 'number') {
        metricData = {
          sum: {
            dataPoints: [
              {
                asDouble: metric.value
              }
            ]
          }
        };
      } else if (typeof metric.value === 'string') {
        // Strings as Gauge with String value (not standard OTLP, but for debugging)
        metricData = {
          gauge: {
            dataPoints: [
              {
                asDouble: 0,
                attributes: [
                  {
                    key: 'value',
                    value: { stringValue: metric.value }
                  }
                ]
              }
            ]
          }
        };
      } else if (typeof metric.value === 'boolean') {
        metricData = {
          gauge: {
            dataPoints: [
              {
                asDouble: metric.value ? 1 : 0
              }
            ]
          }
        };
      } else {
        // Fallback for unknown types
        metricData = {
          sum: {
            dataPoints: [
              {
                asDouble: 0
              }
            ]
          }
        };
      }

      return {
        name: metric.name || 'unknown.metric',
        ...metricData
      };
    });

    return {
      resource: {
        attributes: createResourceAttributes(group.resource)
      },
      scopeMetrics: [
        {
          scope: {
            name: 'instrumentationScope',
            version: '13.2'
          },
          metrics: otelMetrics
        }
      ]
    };
  });

  return {
    resourceMetrics: resourceMetrics
  };
}

module.exports = transform;
module.exports.transform = transform;
module.exports.transformTraces = transform;
module.exports.transformMetrics = transformMetrics;
module.exports.setHostId = setHostId;
module.exports.setPid = setPid;

// Made with Bob
