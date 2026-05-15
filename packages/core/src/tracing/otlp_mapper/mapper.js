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

/**
 * Common database field mappings following OTLP Database Semantic Conventions.
 * These mappings apply to all database span types (pg, mysql, mongodb, redis, etc.).
 */
const databaseMappings = {
  stmt: 'db.statement',
  command: 'db.operation.name',
  host: 'net.peer.name',
  port: 'net.peer.port',
  user: 'db.user',
  db: 'db.name',
  namespace: 'db.namespace',
  collection: 'db.collection.name',
  table: 'db.sql.table',
  operation: 'db.operation.name',
  connection: 'db.connection_string'
};

/**
 * Database span types that should use the common database mappings.
 * Add new database types here as they are instrumented.
 */
const databaseSpanTypes = [
  'pg',
  'mysql',
  'mongodb',
  'redis',
  'mssql',
  'couchbase',
  'elasticsearch',
  'dynamodb',
  'db2',
  'memcached',
  'mongoose',
  'prisma'
];

/**
 * Messaging span types that should use the common messaging mappings.
 */
const messagingSpanTypes = ['kafka'];

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

  // Messaging Semantic Conventions (Kafka, etc.)
  messaging: {
    service: 'messaging.destination.name',
    access: 'messaging.operation.type',
    operation: 'messaging.operation.type'
  }
};

/**
 * Determines the appropriate mapping category for a given span data key.
 *
 * @param {string} key - The span data key (e.g., 'pg', 'mysql', 'http', 'kafka')
 * @returns {'database' | 'messaging' | 'http' | null} The mapping category
 */
function getMappingCategory(key) {
  if (key === 'http') {
    return 'http';
  }
  if (messagingSpanTypes.includes(key)) {
    return 'messaging';
  }
  if (databaseSpanTypes.includes(key)) {
    return 'database';
  }
  return null;
}

/**
 * Gets the appropriate mappings for a given span data key.
 *
 * @param {string} key - The span data key
 * @returns {Object<string, string> | null} The mappings object or null
 */
function getMappingsForKey(key) {
  const category = getMappingCategory(key);

  if (category === 'http') {
    return otlpAttributeMappings.http;
  }
  if (category === 'messaging') {
    return otlpAttributeMappings.messaging;
  }
  if (category === 'database') {
    return databaseMappings;
  }

  return null;
}

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
    if (typeof span.data[key] !== 'object' || span.data[key] === null) {
      return;
    }

    const mappings = getMappingsForKey(key);
    if (!mappings) {
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

/**
 * Returns all OTLP attribute mappings including dynamic database and messaging mappings.
 *
 * @returns {Object<string, Object<string, string>>} All mappings
 */
module.exports.getOtlpAttributeMappings = function () {
  /** @type {Object<string, Object<string, string>>} */
  const allMappings = { ...otlpAttributeMappings };

  // Add database mappings for all database span types
  databaseSpanTypes.forEach(dbType => {
    allMappings[dbType] = databaseMappings;
  });

  // Add messaging mappings for all messaging span types
  messagingSpanTypes.forEach(msgType => {
    allMappings[msgType] = otlpAttributeMappings.messaging;
  });

  return allMappings;
};

// Made with Bob
