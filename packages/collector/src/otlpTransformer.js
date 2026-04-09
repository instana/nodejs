/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Transformiert Instana Traces Format zu OpenTelemetry Format
 *
 * OTEL Format Beispiel:
 * {
 *   "resourceSpans": [
 *     {
 *       "resource": {
 *         "attributes": [
 *           { "key": "service.name", "value": { "stringValue": "checkout-service" } },
 *           { "key": "service.version", "value": { "stringValue": "1.2.3" } },
 *           { "key": "host.name", "value": { "stringValue": "node-1" } }
 *         ]
 *       },
 *       "scopeSpans": [
 *         {
 *           "scope": {
 *             "name": "io.opentelemetry.http",
 *             "version": "1.0.1"
 *           },
 *           "spans": [
 *             {
 *               "traceId": "5b8e1005739815c1054b4f575459392c",
 *               "spanId": "eed258b6641e17d9",
 *               "parentSpanId": "6513c7a9c141094d",
 *               "name": "/calculate-tax",
 *               "kind": 2,
 *               "startTimeUnixNano": "1678901234000000000",
 *               "endTimeUnixNano": "1678901234500000000",
 *               "attributes": [
 *                 { "key": "http.method", "value": { "stringValue": "POST" } },
 *                 { "key": "http.status_code", "value": { "intValue": 200 } }
 *               ],
 *               "status": { "code": 1 }
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
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
  const serviceName = 'dummy';
  attributes.push({
    key: 'service.name',
    value: { stringValue: serviceName }
  });

  if (!from) {
    return attributes;
  }

  // Service Instance ID und Process PID aus Instana "from.e" (entity ID / PID)
  if (from.e) {
    attributes.push({
      key: 'service.instance.id',
      value: { stringValue: from.e }
    });

    attributes.push({
      key: 'process.pid',
      value: { intValue: parseInt(from.e, 10) }
    });
  }

  // Host ID aus Instana "from.h"
  if (from.h) {
    attributes.push({
      key: 'host.id',
      value: { stringValue: from.h }
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

module.exports = transform;

// Made with Bob
