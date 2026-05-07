/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { getOtlpAttributeMappings } = require('./backend_mappers/otlpMapper');

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
 * Converts Instana Span Kind to OTEL Span Kind
 * @param {number} instanaKind - Instana span kind
 * @returns {number} OTEL span kind
 */
function convertSpanKind(instanaKind) {
  // Instana: 1=ENTRY/SERVER, 2=EXIT/CLIENT, 3=INTERMEDIATE/INTERNAL
  // OTEL: 0=UNSPECIFIED, 1=INTERNAL, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER
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
 * Creates OTEL Attributes from Instana Span Data using mapper schema
 * @param {Object} data - Instana span data
 * @returns {Array} OTEL attributes array
 */
function createAttributes(data) {
  const attributes = [];
  const mappings = getOtlpAttributeMappings();

  if (!data) {
    return attributes;
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
      if (otlpKey === 'http.status_code' && typeof value === 'number') {
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
 * Transforms a single Instana Span to OTEL Span
 * @param {Object} instanaSpan - Instana span object
 * @returns {Object} OTEL span object
 */
function transformSpan(instanaSpan) {
  // Validate required fields
  if (typeof instanaSpan.ts !== 'number' || typeof instanaSpan.d !== 'number') {
    // Return a minimal valid span if timestamps are missing
    return {
      traceId: instanaSpan.t || '0',
      spanId: instanaSpan.s || '0',
      name: instanaSpan.n || 'unknown',
      kind: 0,
      startTimeUnixNano: '0',
      endTimeUnixNano: '0',
      attributes: [],
      status: { code: 1 }
    };
  }

  const otelSpan = {
    traceId: instanaSpan.t,
    spanId: instanaSpan.s,
    name: instanaSpan.n || 'unknown',
    kind: convertSpanKind(instanaSpan.k),
    startTimeUnixNano: msToNano(instanaSpan.ts),
    endTimeUnixNano: msToNano(instanaSpan.ts + instanaSpan.d),
    attributes: createAttributes(instanaSpan.data),
    status: createStatus(instanaSpan.ec || 0)
  };

  // Parent Span ID is optional
  if (instanaSpan.p) {
    otelSpan.parentSpanId = instanaSpan.p;
  }

  return otelSpan;
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
