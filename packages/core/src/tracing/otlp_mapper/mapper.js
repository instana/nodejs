/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * OTLP attribute mappings for different span types.
 * Maps Instana span data fields to OTLP semantic convention attributes.
 *
 * Based on OpenTelemetry Semantic Conventions:
 * - HTTP: https://opentelemetry.io/docs/specs/semconv/http/
 * - Database: https://opentelemetry.io/docs/specs/semconv/database/
 * - Messaging: https://opentelemetry.io/docs/specs/semconv/messaging/
 *
 * @type {Object<string, Object<string, string>>}
 */
const otlpAttributeMappings = {
  // HTTP Semantic Conventions
  http: {
    method: 'http.request.method',
    status: 'http.response.status_code',
    url: 'url.full',
    path: 'url.path',
    host: 'server.address',
    protocol: 'network.protocol.name',
    params: 'url.query',
    path_tpl: 'url.template',
    error: 'error.type',
    status_text: 'http.status_text',
    route: 'http.route'
  },

  // PostgreSQL/Database Semantic Conventions
  pg: {
    stmt: 'db.statement',
    host: 'net.peer.name',
    port: 'net.peer.port',
    user: 'db.user',
    db: 'db.name'
  },

  // Kafka/Messaging Semantic Conventions
  kafka: {
    service: 'messaging.destination.name',
    access: 'messaging.operation.type'
  },

  // Service metadata
  service: {
    name: 'service.name'
  }
};

/**
 * Transforms span data fields to OTLP attribute naming while keeping
 * the mapper logic separate from the backend field mapping.
 *
 * @param {import('../../core').InstanaBaseSpan} span
 * @returns {import('../../core').InstanaBaseSpan} The transformed span.
 */
module.exports.transform = span => {
  if (!span || !span.data) {
    return span;
  }

  Object.keys(span.data).forEach(key => {
    const mappings = otlpAttributeMappings[key];
    if (!mappings || typeof span.data[key] !== 'object' || span.data[key] === null) {
      return;
    }

    applyMappings(span.data[key], mappings, key);
  });

  return span;
};

/**
 * Applies OTLP field mappings to a specific data section.
 *
 * @param {Record<string, any>} dataSection
 * @param {Object<string, string>} mappings
 * @param {string} sectionKey
 */
function applyMappings(dataSection, mappings, sectionKey) {
  Object.keys(dataSection).forEach(internalField => {
    const mappedField = mappings[internalField] || `${sectionKey}.${internalField}`;
    dataSection[mappedField] = dataSection[internalField];
    delete dataSection[internalField];
  });
}

module.exports.getOtlpAttributeMappings = function () {
  return otlpAttributeMappings;
};
