/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

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

  // Service Name - support both OTEL_SERVICE_NAME (standard) and SERVICE_NAME (legacy)
  const serviceName = process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'unknown-service';
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
 * Flattens nested objects to a flat object with dot notation
 * @param {Object} obj - Nested object
 * @param {string} prefix - Prefix for the keys
 * @returns {Object} Flat object
 */
function flattenObject(obj, prefix) {
  prefix = prefix || '';
  const flattened = {};

  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      const nested = flattenObject(value, newKey);
      Object.keys(nested).forEach(nestedKey => {
        flattened[nestedKey] = nested[nestedKey];
      });
    } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      // Only take primitive values
      flattened[newKey] = value;
    }
  });

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
    const flattenedMetrics = flattenObject(instanaMetrics, '');

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

module.exports = {
  transformMetrics,
  setHostId,
  setPid
};

// Made with Bob
