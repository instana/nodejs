/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Transformer classes for converting Instana spans to OpenTelemetry format
 * Uses inheritance pattern where specific protocols extend base classes
 *
 * Key Design Principles:
 * 1. MessagingTransformer is a TEMPLATE with common messaging mappings
 * 2. Children (Kafka, RabbitMQ, etc.) automatically inherit ALL messaging mappings
 * 3. Children only need to be defined if they have CUSTOM/ADDITIONAL mappings
 * 4. If no custom mappings needed, just register the span type to use MessagingTransformer
 */

const { toUpperCase, toInteger, generateSpanName, StatusCode } = require('./instana-to-otel-converter-utils');

// ============================================================================
// Attribute Mapping Definitions
// ============================================================================

// ============================================================================
// Constants
// ============================================================================

/**
 * Database system identifiers for OTLP semantic conventions
 */
const DATABASE_SYSTEMS = {
  MONGODB: 'mongodb'
};

/**
 * Messaging system identifiers for OTLP semantic conventions
 */
// const MESSAGING_SYSTEMS = {
//   KAFKA: 'kafka',
//   RABBITMQ: 'rabbitmq',
//   AMQP: 'amqp',
//   SQS: 'sqs',
//   SNS: 'sns'
// };

// ============================================================================
// Base Attribute Mappings by Category
// ============================================================================

/**
 * Base mappings shared across protocol categories
 * Organized by category (messaging, database, rpc, etc.)
 * These provide common fields that specific protocols can extend
 *
 * @type {Object.<string, Object.<string, {key: string, value?: Function}>>}
 */
const BASE_MAPPINGS = {
  /**
   * Common messaging fields shared by all messaging protocols
   * Used by: Kafka, RabbitMQ, AMQP, SQS, etc.
   *
   * @see https://opentelemetry.io/docs/specs/semconv/messaging/
   */
  messaging: {
    'messaging.system': { getter: 'messagingSystem' },
    service: { key: 'messaging.destination.name' },
    access: { key: 'messaging.operation.type' },
    operation: { key: 'messaging.operation.type' }
  },

  /**
   * Common database fields shared by all database protocols
   * Used by: MongoDB, MySQL, PostgreSQL, Redis, etc.
   * (Placeholder for future database support)
   *
   * @see https://opentelemetry.io/docs/specs/semconv/database/
   */
  database: {
    // Example: host, port, name, statement, etc.
  },

  /**
   * Common RPC fields shared by all RPC protocols
   * Used by: gRPC, GraphQL, etc.
   * (Placeholder for future RPC support)
   *
   * @see https://opentelemetry.io/docs/specs/semconv/rpc/
   */
  rpc: {
    // Example: service, method, etc.
  }
};

// ============================================================================
// Protocol-Specific Attribute Mappings
// ============================================================================

/**
 * Protocol-specific attribute mappings
 * Defines how Instana span fields map to OTLP semantic conventions
 *
 * Structure:
 * - Each protocol has its own mapping object
 * - Mappings use format: { key: 'otel.attribute.name', value: transformerFunction }
 * - value transformer is optional (defaults to identity function)
 * - Protocols can extend BASE_MAPPINGS for their category
 *
 * @type {Object.<string, Object.<string, {key: string, value?: Function}>>}
 */
const SPAN_ATTRIBUTE_MAPPINGS = {
  /**
   * HTTP protocol mappings
   * @see https://opentelemetry.io/docs/specs/semconv/http/
   */
  http: {
    method: { key: 'http.request.method', value: toUpperCase },
    status: { key: 'http.response.status_code', value: toInteger },
    url: { key: 'url.full' },
    path: { key: 'url.path' },
    host: { key: 'server.address' },
    protocol: { key: 'network.protocol.name' },
    params: { key: 'url.query' },
    path_tpl: { key: 'url.template' },
    error: { key: 'error.type' },
    status_text: { key: 'http.status_text' },
    route: { key: 'http.route' },
    header: { key: 'http.request.header' },
    response_header: { key: 'http.response.header' }
  },

  /**
   * Generic messaging protocol mappings
   * Uses only the base messaging fields
   * @see https://opentelemetry.io/docs/specs/semconv/messaging/
   */
  messaging: BASE_MAPPINGS.messaging,

  /**
   * Kafka-specific mappings
   * Extends base messaging with Kafka-specific fields
   * @see https://opentelemetry.io/docs/specs/semconv/messaging/kafka/
   */
  kafka: {
    ...BASE_MAPPINGS.messaging,
    topic: { key: 'messaging.destination.name' },
    partition: { key: 'messaging.kafka.destination.partition', value: toInteger },
    offset: { key: 'messaging.kafka.message.offset', value: toInteger },
    key: { key: 'messaging.kafka.message.key' },
    group: { key: 'messaging.consumer.group.name' }
  },

  /**
   * RabbitMQ-specific mappings
   * Extends base messaging with RabbitMQ-specific fields
   * @see https://opentelemetry.io/docs/specs/semconv/messaging/rabbitmq/
   */
  rabbitmq: {
    ...BASE_MAPPINGS.messaging,
    queue: { key: 'messaging.destination.name' },
    exchange: { key: 'messaging.rabbitmq.destination.routing_key' },
    routingKey: { key: 'messaging.rabbitmq.destination.routing_key' },
    correlationId: { key: 'messaging.message.conversation_id' }
  },

  /**
   * MongoDB-specific mappings
   * Maps MongoDB span fields to OTLP database semantic conventions
   * @see https://opentelemetry.io/docs/specs/semconv/database/mongodb/
   */
  mongo: {
    'db.system': { getter: 'dbSystem' },
    command: { key: 'db.operation' },
    service: { key: 'db.connection_string' },
    namespace: { key: 'db.mongodb.collection' },
    filter: { key: 'db.statement' }
  },

  /**
   * Peer/network information mappings
   * Used by database and other protocols to capture network details
   * This is auxiliary data that appears alongside primary protocol data
   *
   * Note: This is not a primary span type but auxiliary data that can appear
   * with other span types (e.g., database spans often include peer information)
   *
   * @see https://opentelemetry.io/docs/specs/semconv/general/attributes/#server-and-client-attributes
   */
  peer: {
    hostname: { key: 'net.peer.name' },
    port: { key: 'net.peer.port', value: toInteger }
  }
};

// ============================================================================
// Base Transformer Class
// ============================================================================

/**
 * Base transformer class for all span types
 * Provides common metadata transformation logic
 */
class BaseTransformer {
  constructor(span, spanType) {
    this.span = span;
    this.spanType = spanType;
  }

  /**
   * Get metadata mappings (common fields like traceId, spanId, etc.)
   * Override in subclasses if needed
   */
  getMetaMappings() {
    return {};
  }

  /**
   * Get data attribute mappings (protocol-specific fields)
   * Must be implemented by subclasses
   */
  getDataMappings() {
    return {
      mappings: {}
    };
  }

  /**
   * Get span name
   * Can be overridden by subclasses for custom naming
   */
  getSpanName() {
    return generateSpanName(this.span);
  }

  /**
   * Get span status
   * Can be overridden by subclasses for protocol-specific status logic
   *
   * @returns {Object} OTLP status object with code and optional message
   */
  getStatus() {
    const status = { code: StatusCode.UNSET };

    // Basic error check using error count field
    if (this.span.ec && this.span.ec > 0) {
      status.code = StatusCode.ERROR;
      status.message = 'Error occurred';
    } else {
      status.code = StatusCode.OK;
    }

    return status;
  }

  /**
   * Transform metadata fields
   */
  meta() {
    return this.getMetaMappings();
  }

  /**
   * Transform data fields
   */
  data() {
    return this.getDataMappings();
  }

  /**
   * Helper to get span data for this transformer's type
   */
  getSpanData() {
    return this.span.data?.[this.spanType] || {};
  }
}

// ============================================================================
// HTTP Transformer
// ============================================================================

/**
 * HTTP-specific transformer
 */
class HttpTransformer extends BaseTransformer {
  constructor(span) {
    super(span, 'http');
  }

  getDataMappings() {
    return {
      mappings: SPAN_ATTRIBUTE_MAPPINGS.http
    };
  }

  /**
   * Generate span name for HTTP spans
   * Format: "METHOD /path"
   * Example: "GET /api/users"
   */
  getSpanName() {
    const data = this.getSpanData();
    const method = data.method || 'HTTP';
    const httpPath = data.path || data.url || '/';
    return `${method} ${httpPath}`;
  }

  /**
   * Get HTTP-specific status
   * Checks error count and HTTP status code
   */
  getStatus() {
    const status = { code: StatusCode.UNSET };
    const data = this.getSpanData();

    // Check error count first
    if (this.span.ec && this.span.ec > 0) {
      status.code = StatusCode.ERROR;
      status.message = data.error || 'Error occurred';
    } else if (data.status) {
      // Check HTTP status code
      const httpStatus = data.status;
      if (httpStatus >= 400) {
        status.code = StatusCode.ERROR;
        status.message = `HTTP ${httpStatus}`;
      } else if (httpStatus >= 200 && httpStatus < 300) {
        status.code = StatusCode.OK;
      }
    } else {
      status.code = StatusCode.OK;
    }

    return status;
  }
}

// ============================================================================
// Messaging Base Transformer (TEMPLATE for all messaging protocols)
// ============================================================================

/**
 * Base transformer for messaging protocols
 * This is the TEMPLATE that defines common messaging semantic conventions
 *
 * ALL messaging protocols inherit these mappings automatically:
 * - service -> messaging.destination.name
 * - access -> messaging.operation.type
 * - operation -> messaging.operation.type
 * - messaging.system -> computed via getter
 *
 * Children can extend/override by calling super.getDataMappings() and merging
 */
class MessagingTransformer extends BaseTransformer {
  constructor(span, systemName) {
    super(span, systemName);
    this.systemName = systemName;
  }

  /**
   * Getter for messaging.system attribute
   * Called dynamically by the mapping engine when processing getter-based mappings
   */
  get messagingSystem() {
    return this.systemName;
  }

  getDataMappings() {
    // Automatically resolve mappings based on systemName
    const mappings = SPAN_ATTRIBUTE_MAPPINGS[this.systemName] || SPAN_ATTRIBUTE_MAPPINGS.messaging;

    return {
      mappings: mappings
    };
  }

  /**
   * Generate span name for messaging spans
   * Format: "operation destination"
   * Example: "send my-topic" or "receive my-queue"
   */
  getSpanName() {
    const data = this.getSpanData();
    const operation = data.access || data.operation || 'messaging';
    const destination = data.service || data.topic || data.queue || 'unknown';
    return `${operation} ${destination}`;
  }
}

// ============================================================================
// Kafka Transformer (extends Messaging with additional mappings)
// ============================================================================

/**
 * Kafka-specific transformer
 * Inherits ALL messaging mappings (service, access, operation) from MessagingTransformer
 * Adds Kafka-specific fields (topic, partition, offset, key, group)
 * Only overrides methods for custom behavior (span naming and status)
 */
class KafkaTransformer extends MessagingTransformer {
  constructor(span) {
    super(span, 'kafka');
  }

  /**
   * Generate span name for Kafka spans
   * Format: "operation topic"
   * Example: "send my-topic" or "consume my-topic"
   */
  getSpanName() {
    const data = this.getSpanData();
    const operation = data.access || data.operation || 'kafka';
    const topic = data.service || data.topic || 'unknown';
    return `${operation} ${topic}`;
  }

  /**
   * Get Kafka-specific status
   * Checks error count and Kafka error field
   */
  getStatus() {
    const status = { code: StatusCode.UNSET };
    const data = this.getSpanData();

    // Check error count first
    if (this.span.ec && this.span.ec > 0) {
      status.code = StatusCode.ERROR;
      status.message = data.error || 'Kafka error occurred';
    } else {
      status.code = StatusCode.OK;
    }

    return status;
  }
}

// ============================================================================
// Database Transformers
// ============================================================================

/**
 * MongoDB-specific transformer
 *
 * Handles MongoDB database operations and automatically processes auxiliary
 * data like peer information when present in the span.
 *
 * Key Features:
 * - Converts MongoDB commands to OTLP database semantic conventions
 * - Generates descriptive span names (e.g., "mongodb.find")
 * - Adds db.system attribute automatically
 * - Works with multi-key span data (mongo + peer)
 *
 * @extends BaseTransformer
 * @see https://opentelemetry.io/docs/specs/semconv/database/mongodb/
 */
class MongoTransformer extends BaseTransformer {
  /**
   * Creates a MongoDB transformer instance
   * @param {Object} span - The Instana span object
   */
  constructor(span) {
    super(span, 'mongo');
  }

  /**
   * Returns data mappings configuration for MongoDB spans
   *
   * @returns {Object} Configuration object with mappings
   */
  getDataMappings() {
    return {
      mappings: SPAN_ATTRIBUTE_MAPPINGS.mongo
    };
  }

  /**
   * Getter for db.system attribute
   * Called dynamically by the mapping engine when processing getter-based mappings
   */
  get dbSystem() {
    return DATABASE_SYSTEMS.MONGODB;
  }

  /**
   * Generates span name for MongoDB operations
   *
   * Format: "mongodb.{operation}"
   *
   * @returns {string} The generated span name
   * @example
   * // For a find operation
   * getSpanName() // Returns: "mongodb.find"
   *
   * @example
   * // For an insert operation
   * getSpanName() // Returns: "mongodb.insert"
   */
  getSpanName() {
    const data = this.getSpanData();
    const command = data.command || 'operation';
    return `mongodb.${command}`;
  }

  /**
   * Determines span status based on error count
   *
   * @returns {Object} OTLP status object
   * @returns {number} return.code - Status code (OK=1, ERROR=2)
   * @returns {string} [return.message] - Error message if status is ERROR
   */
  getStatus() {
    const status = { code: StatusCode.UNSET };

    if (this.span.ec && this.span.ec > 0) {
      status.code = StatusCode.ERROR;
      status.message = 'MongoDB operation failed';
    } else {
      status.code = StatusCode.OK;
    }

    return status;
  }
}

// ============================================================================
// Transformer Registry
// ============================================================================

// ============================================================================
// Transformer Registry and Configuration
// ============================================================================

/**
 * Registry mapping span types to their transformer classes
 *
 * This registry determines which transformer class handles each span type.
 * When a span is converted, the appropriate transformer is selected based on
 * the span's data keys.
 *
 * Design Patterns:
 * - For protocols with custom logic: Create a dedicated transformer class
 * - For protocols using base mappings: Use factory function with MessagingTransformer
 *
 * @type {Object.<string, Function>}
 *
 * @example
 * // Dedicated transformer for complex protocols
 * const TRANSFORMER_REGISTRY = {
 *   http: HttpTransformer,
 *   kafka: KafkaTransformer
 * };
 *
 * @example
 * // Factory function for simple protocols
 * const TRANSFORMER_REGISTRY = {
 *   sqs: (span) => new MessagingTransformer(span, 'sqs', 'sqs')
 * };
 */
const TRANSFORMER_REGISTRY = {
  // HTTP protocol
  http: HttpTransformer,

  // Messaging protocols
  kafka: KafkaTransformer,
  rabbitmq: span => new MessagingTransformer(span, 'rabbitmq'),

  // Database protocols
  mongo: MongoTransformer

  // Future additions:
  // sqs: (span) => new MessagingTransformer(span, 'sqs'),
  // sns: (span) => new MessagingTransformer(span, 'sns'),
  // redis: RedisTransformer,
  // mysql: MySQLTransformer,
  // postgresql: PostgreSQLTransformer
};

/**
 * Priority order for span type selection when multiple data keys exist
 *
 * When a span contains multiple data keys (e.g., both 'mongo' and 'peer'),
 * this array determines which transformer to use. Primary span types are
 * checked first, auxiliary data types last.
 *
 * Priority Levels:
 * 1. HTTP - Web/API requests
 * 2. Messaging - Kafka, RabbitMQ, etc.
 * 3. Databases - MongoDB, MySQL, etc.
 * 4. Auxiliary - peer, service metadata
 *
 * @type {string[]}
 * @constant
 */
const SPAN_TYPE_PRIORITY = [
  // HTTP
  'http',

  // Messaging
  'kafka',
  'rabbitmq',

  // Databases
  'mongo',

  // Auxiliary data (lowest priority)
  'peer'
];

// ============================================================================
// Transformer Factory
// ============================================================================

/**
 * Factory function to get the appropriate transformer for a span
 *
 * This function handles the complex case where spans may have multiple data keys
 * (e.g., MongoDB spans with both 'mongo' and 'peer' data). It uses a priority-based
 * selection to ensure the correct transformer is chosen.
 *
 * Selection Algorithm:
 * 1. Check if span has data
 * 2. Try to match using SPAN_TYPE_PRIORITY order (primary types first)
 * 3. Fallback to checking all data keys (for types not in priority list)
 * 4. Default to BaseTransformer if no match found
 *
 * @param {Object} span - The Instana span object
 * @param {string} span.n - Span name
 * @param {Object} [span.data] - Span data containing protocol-specific information
 * @returns {BaseTransformer} The appropriate transformer instance
 *
 * @example
 * // MongoDB span with peer data
 * const span = {
 *   n: 'mongo',
 *   data: {
 *     mongo: { command: 'find', ... },
 *     peer: { hostname: '127.0.0.1', port: 27017 }
 *   }
 * };
 * const transformer = getTransformer(span);
 * // Returns: MongoTransformer instance (not PeerTransformer)
 *
 * @example
 * // HTTP span
 * const span = {
 *   n: 'node.http.server',
 *   data: {
 *     http: { method: 'GET', url: '/api/users' }
 *   }
 * };
 * const transformer = getTransformer(span);
 * // Returns: HttpTransformer instance
 */
function getTransformer(span) {
  // Validate input
  if (!span || !span.data) {
    return new BaseTransformer(span, 'unknown');
  }

  const dataKeys = Object.keys(span.data);

  // Strategy 1: Priority-based selection
  // Check span types in priority order to handle multi-key spans correctly
  const prioritizedType = SPAN_TYPE_PRIORITY.find(type => dataKeys.includes(type) && TRANSFORMER_REGISTRY[type]);

  if (prioritizedType) {
    const TransformerClass = TRANSFORMER_REGISTRY[prioritizedType];
    return instantiateTransformer(TransformerClass, span);
  }

  // Strategy 2: Fallback to first matching key
  // For span types not in the priority list
  const matchedType = dataKeys.find(key => TRANSFORMER_REGISTRY[key]);

  if (matchedType) {
    const TransformerClass = TRANSFORMER_REGISTRY[matchedType];
    return instantiateTransformer(TransformerClass, span);
  }

  // Strategy 3: Default transformer
  return new BaseTransformer(span, 'unknown');
}

/**
 * Helper function to instantiate a transformer
 * Handles both class constructors and factory functions
 *
 * @param {Function} TransformerClass - Transformer class or factory function
 * @param {Object} span - The Instana span object
 * @returns {BaseTransformer} Transformer instance
 * @private
 */
function instantiateTransformer(TransformerClass, span) {
  // Check if it's a class constructor
  if (typeof TransformerClass === 'function' && TransformerClass.prototype) {
    return new TransformerClass(span);
  }

  // Check if it's a factory function
  if (typeof TransformerClass === 'function') {
    return TransformerClass(span);
  }

  // Fallback (should never reach here)
  return new BaseTransformer(span, 'unknown');
}

/**
 * Register a new transformer for a span type
 * Useful for dynamically adding transformers without modifying this file
 *
 * @param {string} spanType - The span type (e.g., 'sqs', 'sns')
 * @param {Function} TransformerClass - The transformer class or factory function
 */
function registerTransformer(spanType, TransformerClass) {
  TRANSFORMER_REGISTRY[spanType] = TransformerClass;
}

/**
 * Dynamically determine the span type from an Instana span
 * Checks span.data keys against registered transformer types
 *
 * @param {Object} instanaSpan - The Instana span object
 * @returns {string|null} The span type (http, kafka, etc.) or null if not found
 */
function getSpanType(instanaSpan) {
  if (!instanaSpan?.data) return null;

  // Find first data key that matches a registered transformer
  return Object.keys(instanaSpan.data).find(key => key in TRANSFORMER_REGISTRY) || null;
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  BaseTransformer,
  HttpTransformer,
  MessagingTransformer,
  KafkaTransformer,
  MongoTransformer,
  getTransformer,
  registerTransformer,
  getSpanType,
  TRANSFORMER_REGISTRY,
  SPAN_ATTRIBUTE_MAPPINGS
};

// Made with Bob
