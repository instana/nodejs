/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// Gespeicherte Resource-Informationen für Metrics (wenn kein "from" Feld vorhanden)
let cachedHostId = null;
let cachedPid = null;

/**
 * Setzt die Host-ID für Resource Attributes
 * @param {string} hostId - Host ID
 */
function setHostId(hostId) {
  cachedHostId = hostId;
}

/**
 * Setzt die PID für Resource Attributes
 * @param {string|number} pid - Process ID
 */
function setPid(pid) {
  cachedPid = String(pid);
}

/**
 * Transformiert Instana Traces Format zu OpenTelemetry Format
 *
 * OTEL Format Beispiel:
 * {
 *   "resourceSpans": [{
 *     "resource": {
 *       "attributes": [
 *         {"key": "service.name", "value": {"stringValue": "demoService"}},
 *         {"key": "process.pid", "value": {"intValue": 12345}},
 *         {"key": "host.name", "value": {"stringValue": "My Fancy Host"}}
 *       ]
 *     },
 *     "scopeSpans": [{
 *       "scope": {
 *         "name": "@instana/collector",
 *         "version": "1.0.0"
 *       },
 *       "spans": [{
 *         "traceId": "0a0b0c0d010203040506070809008081",
 *         "spanId": "010203040a0b0c0d",
 *         "parentSpanId": "0d0c0b0a04030201",
 *         "name": "some span",
 *         "kind": 3,
 *         "startTimeUnixNano": "1775732779960000000",
 *         "endTimeUnixNano": "1775732779969000000",
 *         "attributes": [
 *           {"key": "http.method", "value": {"stringValue": "GET"}},
 *           {"key": "http.status_code", "value": {"intValue": 200}},
 *           {"key": "http.url", "value": {"stringValue": "/"}}
 *         ],
 *         "status": {"code": 1}
 *       }]
 *     }]
 *   }]
 * }
 *
 * INSTANA Format Beispiel:
 * [{
 *   "t": "b94dae370181cbd5",           // trace ID
 *   "s": "3c84e4b658761152",           // span ID
 *   "p": "parent_span_id",             // parent span ID (optional)
 *   "n": "node.http.server",           // span name
 *   "k": 1,                            // span kind (1=SERVER, 2=CLIENT, 3=PRODUCER, 4=CONSUMER, 5=INTERNAL)
 *   "f": {                             // from (resource attributes)
 *     "e": "74662",                    // entity ID
 *     "h": "7e:0d:24:ff:fe:aa:33:af"  // host ID
 *   },
 *   "ec": 0,                           // error count
 *   "ts": 1775729099820,               // timestamp in milliseconds
 *   "d": 8,                            // duration in milliseconds
 *   "stack": [],
 *   "data": {                          // span attributes
 *     "http": {
 *       "path_tpl": "/",
 *       "status": 304,
 *       "method": "GET",
 *       "url": "/",
 *       "host": "localhost:2807"
 *     }
 *   }
 * }]
 */

/**
 * OTEL Metrics Format Beispiel:
 * {
 *   "resourceMetrics": [{
 *     "resource": {
 *       "attributes": [
 *         {"key": "service.name", "value": {"stringValue": "metricsService"}},
 *         {"key": "process.pid", "value": {"intValue": 4711}},
 *         {"key": "host.name", "value": {"stringValue": "My Lame Host"}}
 *       ]
 *     },
 *     "scopeMetrics": [{
 *       "scope": {
 *         "name": "instrumentationScope",
 *         "version": "13.2"
 *       },
 *       "metrics": [{
 *         "name": "sumMetricName",
 *         "sum": {
 *           "dataPoints": [{
 *             "asDouble": 42.42
 *           }]
 *         }
 *       }]
 *     }]
 *   }]
 * }
 */

/**
 * Konvertiert Instana Span Kind zu OTEL Span Kind
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
 * Konvertiert Millisekunden zu Nanosekunden (als String)
 * @param {number} ms - Millisekunden
 * @returns {string} Nanosekunden als String
 */
function msToNano(ms) {
  return String(ms * 1000000);
}

/**
 * Erstellt OTEL Attribute aus Instana Span Data
 * @param {Object} data - Instana span data
 * @returns {Array} OTEL attributes array
 */
function createAttributes(data) {
  const attributes = [];

  if (!data) {
    return attributes;
  }

  // HTTP Attribute
  if (data.http) {
    if (data.http.method) {
      attributes.push({
        key: 'http.method',
        value: { stringValue: data.http.method }
      });
    }
    if (data.http.status) {
      attributes.push({
        key: 'http.status_code',
        value: { intValue: data.http.status }
      });
    }
    if (data.http.url) {
      attributes.push({
        key: 'http.url',
        value: { stringValue: data.http.url }
      });
    }
    if (data.http.host) {
      attributes.push({
        key: 'http.host',
        value: { stringValue: data.http.host }
      });
    }
    if (data.http.path_tpl) {
      attributes.push({
        key: 'http.target',
        value: { stringValue: data.http.path_tpl }
      });
    }
  }

  // Weitere Datenfelder können hier hinzugefügt werden
  // z.B. data.db, data.service, etc.

  return attributes;
}

/**
 * Erstellt Resource Attributes aus Instana "from" Feld
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

  // Service Name - verwende process.title oder einen Default
  const serviceName = process.env.SERVICE_NAME;
  attributes.push({
    key: 'service.name',
    value: { stringValue: serviceName }
  });

  // Verwende "from" Feld wenn vorhanden, sonst cached Werte
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
 * Bestimmt den Status Code basierend auf Error Count
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
 * Transformiert einen einzelnen Instana Span zu OTEL Span
 * @param {Object} instanaSpan - Instana span object
 * @returns {Object} OTEL span object
 */
function transformSpan(instanaSpan) {
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

  // Parent Span ID ist optional
  if (instanaSpan.p) {
    otelSpan.parentSpanId = instanaSpan.p;
  }

  return otelSpan;
}

/**
 * Transformiert Instana Traces zu OTEL Format
 * @param {Array} instanaTraces - Array von Instana spans
 * @returns {Object} OTEL traces object
 */
function transform(instanaTraces) {
  if (!Array.isArray(instanaTraces) || instanaTraces.length === 0) {
    return {
      resourceSpans: []
    };
  }

  // Gruppiere Spans nach Resource (from field)
  const spansByResource = new Map();

  instanaTraces.forEach(function (instanaSpan) {
    // Cache PID und Host-ID aus dem ersten Span für Metrics
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

  // Erstelle OTEL ResourceSpans
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
 * Flacht verschachtelte Objekte zu einem flachen Objekt mit Punkt-Notation
 * @param {Object} obj - Verschachteltes Objekt
 * @param {string} prefix - Prefix für die Keys
 * @returns {Object} Flaches Objekt
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
      // Rekursiv verschachtelte Objekte flach machen
      const nested = flattenObject(value, newKey);
      for (const nestedKey in nested) {
        if (nested.hasOwnProperty(nestedKey)) {
          flattened[nestedKey] = nested[nestedKey];
        }
      }
    } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      // Nur primitive Werte übernehmen
      flattened[newKey] = value;
    }
  }

  return flattened;
}

/**
 * Transformiert Instana Metrics zu OTEL Format
 * @param {Array} instanaMetrics - Array von Instana metrics
 * @returns {Object} OTEL metrics object
 */
function transformMetrics(instanaMetrics) {
  // Wenn es ein Objekt ist, konvertiere die Werte zu einem Array
  let metricsArray = instanaMetrics;

  if (!Array.isArray(instanaMetrics)) {
    if (!instanaMetrics || typeof instanaMetrics !== 'object') {
      return {
        resourceMetrics: []
      };
    }

    // Flache das verschachtelte Objekt
    const flattenedMetrics = flattenObject(instanaMetrics);

    // Konvertiere flaches Objekt zu Array von Metrics
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

  // Gruppiere Metrics nach Resource
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

  // Erstelle OTEL ResourceMetrics
  const resourceMetrics = Array.from(metricsByResource.values()).map(function (group) {
    const otelMetrics = group.metrics.map(function (metric) {
      // Bestimme den Metrik-Typ basierend auf dem Wert
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
        // Strings als Gauge mit String-Wert (nicht standard OTLP, aber für Debugging)
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
        // Fallback für unbekannte Typen
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
module.exports.transformTraces = transform;
module.exports.transformMetrics = transformMetrics;
module.exports.setHostId = setHostId;
module.exports.setPid = setPid;

// Made with Bob
