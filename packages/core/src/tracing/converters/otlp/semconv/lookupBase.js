/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// base loopup based on v1.23 with some common mappings as well
const BASE_OTLP = {
  metadata: {
    TRACE_ID: 'traceId',
    SPAN_ID: 'spanId',
    PARENT_ID: 'parentSpanId',
    SPAN_KIND: 'kind',
    NAME: 'name',
    STATUS: 'status',
    RESOURCE: 'resource',
    INSTRUMENTATION_SCOPE: 'instrumentationScope',
    EVENTS: 'events',
    LINKS: 'links'
    // Note: Timestamp/duration fields are version-specific and defined in overrides
  },

  http: {
    REQUEST_METHOD: 'http.method', // Default v1.23
    RESPONSE_STATUS: 'http.status_code', // Default v1.23
    ROUTE: 'http.route',
    STATUS_TEXT: 'http.status_text',
    REQUEST_HEADER: 'http.request.header',
    URL_FULL: 'http.url', // Default v1.23
    URL_PATH: 'http.target', // Default v1.23
    URL_QUERY: 'http.url.query',
    URL_TEMPLATE: 'http.url.template',
    SERVER_ADDRESS: 'server.address',
    NETWORK_PROTOCOL: 'network.protocol.name',
    ERROR_TYPE: 'error.type'
  },

  messaging: {
    SYSTEM: 'messaging.system',
    OPERATION_TYPE: 'messaging.operation.type',
    DESTINATION_NAME: 'messaging.destination', // Default v1.23
    SERVER_ADDRESS: 'server.address',
    CONSUMER_GROUP: 'messaging.consumer.group.name',
    MESSAGE_ID: 'messaging.message.id',
    MESSAGE_BODY_SIZE: 'messaging.message.body.size',
    kafka: {
      PARTITION: 'messaging.kafka.partition', // Default v1.23
      OFFSET: 'messaging.kafka.message.offset',
      MESSAGE_KEY: 'messaging.kafka.message.key'
    },
    rabbitmq: {
      ROUTING_KEY: 'messaging.rabbitmq.destination.routing_key',
      MESSAGE_ROUTING_KEY: 'messaging.rabbitmq.message.routing_key'
    },
    gcp: { PROJECT_ID: 'gcp.project_id' }
  },

  database: {
    SYSTEM: 'db.system',
    OPERATION: 'db.operation.name',
    NAMESPACE: 'db.namespace',
    STATEMENT: 'db.statement',
    NAME: 'db.name',
    USER: 'db.user',
    COLLECTION: 'db.collection.name',
    TABLE: 'db.sql.table',
    SERVER_ADDRESS: 'server.address',
    PEER_NAME: 'net.peer.name', // Default v1.23
    PEER_PORT: 'net.peer.port', // Default v1.23
    CONNECTION_STRING: 'db.connection_string'
  },

  rpc: {
    SYSTEM: 'rpc.system',
    METHOD: 'rpc.method',
    SERVICE: 'rpc.service',
    GRPC_STATUS: 'rpc.grpc.status_code',
    GRPC_ERROR: 'rpc.grpc.status_message'
  },

  graphql: {
    OPERATION_NAME: 'graphql.operation.name',
    OPERATION_TYPE: 'graphql.operation.type'
  },

  log: {
    BODY: 'log.body',
    SEVERITY: 'log.severity',
    FUNCTION: 'code.function'
  },

  cloud: {
    REGION: 'cloud.region',
    PROVIDER: 'cloud.provider',
    gcp: {
      PROJECT_ID: 'gcp.project_id',
      STORAGE_BUCKET: 'gcp.storage.bucket',
      STORAGE_OBJECT: 'gcp.storage.object',
      STORAGE_SOURCE_BUCKET: 'gcp.storage.source.bucket',
      STORAGE_DESTINATION_BUCKET: 'gcp.storage.destination.bucket',
      STORAGE_SOURCE_OBJECT: 'gcp.storage.source.object',
      STORAGE_DESTINATION_OBJECT: 'gcp.storage.destination.object'
    },
    aws: {
      S3_BUCKET: 'aws.s3.bucket',
      S3_KEY: 'aws.s3.key',
      KINESIS_STREAM: 'aws.kinesis.stream_name',
      KINESIS_SHARD: 'aws.kinesis.shard_id',
      KINESIS_SHARD_ITERATOR_TYPE: 'aws.kinesis.shard_iterator_type',
      KINESIS_STARTING_SEQUENCE_NUMBER: 'aws.kinesis.starting_sequence_number',
      KINESIS_EXPLICIT_HASH_KEY: 'aws.kinesis.explicit_hash_key'
    },
    azure: {
      STORAGE_ACCOUNT: 'az.storage.account.name',
      CONTAINER: 'az.storage.container.name',
      BLOB: 'az.storage.blob.name'
    }
  },

  faas: {
    NAME: 'faas.name',
    INVOCATION_TYPE: 'faas.invocation_type'
  },

  network: {
    PEER_NAME: 'net.peer.name', // Default v1.23
    PEER_PORT: 'net.peer.port' // Default v1.23
  }
};

module.exports = { BASE_OTLP };
