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

const { toUpperCase, toInteger, generateSpanName } = require('./instana-to-otel-converter-utils');

// ============================================================================
// Attribute Mapping Definitions
// ============================================================================

/**
 * Base mappings shared across protocol categories
 * Organized by category (messaging, database, rpc, etc.)
 * These provide common fields that specific protocols can extend
 */
const BASE_MAPPINGS = {
  /**
   * Common messaging fields shared by all messaging protocols
   * Used by: Kafka, RabbitMQ, AMQP, SQS, etc.
   */
  messaging: {
    service: { key: 'messaging.destination.name' },
    access: { key: 'messaging.operation.type' },
    operation: { key: 'messaging.operation.type' }
  },

  /**
   * Common database fields shared by all database protocols
   * Used by: MongoDB, MySQL, PostgreSQL, Redis, etc.
   * (Placeholder for future database support)
   */
  database: {
    // Example: host, port, name, statement, etc.
  },

  /**
   * Common RPC fields shared by all RPC protocols
   * Used by: gRPC, GraphQL, etc.
   * (Placeholder for future RPC support)
   */
  rpc: {
    // Example: service, method, etc.
  }
};

/**
 * Protocol-specific attribute mappings
 * Defines how Instana span fields map to OTLP semantic conventions
 *
 * Structure:
 * - Each protocol has its own mapping object
 * - Mappings use format: { key: 'otel.attribute.name', value: transformerFunction }
 * - value transformer is optional (defaults to identity function)
 * - Protocols can extend BASE_MAPPINGS for their category
 */
const SPAN_ATTRIBUTE_MAPPINGS = {
  /**
   * HTTP protocol mappings
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
   */
  messaging: BASE_MAPPINGS.messaging,

  /**
   * Kafka-specific mappings
   * Extends base messaging with Kafka-specific fields
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
   */
  rabbitmq: {
    ...BASE_MAPPINGS.messaging,
    queue: { key: 'messaging.destination.name' },
    exchange: { key: 'messaging.rabbitmq.destination.routing_key' },
    routingKey: { key: 'messaging.rabbitmq.destination.routing_key' },
    correlationId: { key: 'messaging.message.conversation_id' }
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
      mappings: {},
      prefix: 'span',
      additionalAttributes: {}
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
      mappings: SPAN_ATTRIBUTE_MAPPINGS.http,
      prefix: 'http',
      additionalAttributes: {}
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
 *
 * Children can extend/override by calling super.getDataMappings() and merging
 */
class MessagingTransformer extends BaseTransformer {
  constructor(span, spanType, systemName) {
    super(span, spanType);
    this.systemName = systemName || spanType;
  }

  getDataMappings() {
    return {
      mappings: SPAN_ATTRIBUTE_MAPPINGS.messaging,
      prefix: `messaging.${this.systemName}`,
      additionalAttributes: {
        'messaging.system': this.systemName
      }
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
 */
class KafkaTransformer extends MessagingTransformer {
  constructor(span) {
    super(span, 'kafka', 'kafka');
  }

  getDataMappings() {
    return {
      mappings: SPAN_ATTRIBUTE_MAPPINGS.kafka,
      prefix: 'messaging.kafka',
      additionalAttributes: {
        'messaging.system': 'kafka'
      }
    };
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
}

// ============================================================================
// RabbitMQ Transformer (extends Messaging with additional mappings)
// ============================================================================

/**
 * RabbitMQ-specific transformer
 * Inherits ALL messaging mappings (service, access, operation) from MessagingTransformer
 * Adds RabbitMQ-specific fields (queue, exchange, routingKey, correlationId)
 */
class RabbitMQTransformer extends MessagingTransformer {
  constructor(span) {
    super(span, 'rabbitmq', 'rabbitmq');
  }

  getDataMappings() {
    return {
      mappings: SPAN_ATTRIBUTE_MAPPINGS.rabbitmq,
      prefix: 'messaging.rabbitmq',
      additionalAttributes: {
        'messaging.system': 'rabbitmq'
      }
    };
  }
}

// ============================================================================
// Transformer Registry
// ============================================================================

/**
 * Registry mapping span types to their transformer classes
 *
 * For messaging protocols with NO custom mappings, just map to MessagingTransformer
 * For messaging protocols WITH custom mappings, create a specific class (like KafkaTransformer)
 */
const TRANSFORMER_REGISTRY = {
  http: HttpTransformer,
  kafka: KafkaTransformer,
  rabbitmq: RabbitMQTransformer

  // Example: SQS has no custom mappings, just uses MessagingTransformer
  // sqs: (span) => new MessagingTransformer(span, 'sqs', 'sqs'),

  // Example: SNS has no custom mappings, just uses MessagingTransformer
  // sns: (span) => new MessagingTransformer(span, 'sns', 'sns'),

  // Example: If we add NATS with custom mappings, create NatsTransformer class
  // nats: NatsTransformer
};

// ============================================================================
// Transformer Factory
// ============================================================================

/**
 * Factory function to get the appropriate transformer for a span
 *
 * @param {Object} span - The Instana span object
 * @returns {BaseTransformer} The appropriate transformer instance
 */
function getTransformer(span) {
  if (!span || !span.data) {
    return new BaseTransformer(span, 'unknown');
  }

  // Find the first matching span type in the data
  for (const spanType of Object.keys(span.data)) {
    const TransformerClass = TRANSFORMER_REGISTRY[spanType];

    if (TransformerClass) {
      // If it's a class, instantiate it
      if (typeof TransformerClass === 'function' && TransformerClass.prototype) {
        return new TransformerClass(span);
      }
      // If it's a factory function, call it
      if (typeof TransformerClass === 'function') {
        return TransformerClass(span);
      }
    }
  }

  // Default to base transformer
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

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  BaseTransformer,
  HttpTransformer,
  MessagingTransformer,
  KafkaTransformer,
  RabbitMQTransformer,
  getTransformer,
  registerTransformer,
  TRANSFORMER_REGISTRY
};

// Made with Bob
