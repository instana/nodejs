/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const {
  convertSpanId,
  convertTraceId,
  convertSpanKind,
  convertEndTime,
  convertStartTime,
  toUpperCase
} = require('./span-converter-util');

// OTLP LOOKUP MAP
const OTLP = {
  http: {
    REQUEST_METHOD: 'http.request.method',
    RESPONSE_STATUS: 'http.response.status_code',
    ROUTE: 'http.route',
    STATUS_TEXT: 'http.status_text',
    REQUEST_HEADER: 'http.request.header',
    URL_FULL: 'url.full',
    URL_PATH: 'url.path',
    URL_QUERY: 'url.query',
    URL_TEMPLATE: 'url.template',
    SERVER_ADDRESS: 'server.address',
    NETWORK_PROTOCOL: 'network.protocol.name',
    ERROR_TYPE: 'error.type'
  },

  messaging: {
    SYSTEM: 'messaging.system',
    OPERATION_TYPE: 'messaging.operation.type',
    DESTINATION_NAME: 'messaging.destination.name',
    SERVER_ADDRESS: 'server.address',
    CONSUMER_GROUP: 'messaging.consumer.group.name',
    MESSAGE_ID: 'messaging.message.id',
    MESSAGE_BODY_SIZE: 'messaging.message.body.size',
    kafka: {
      PARTITION: 'messaging.kafka.destination.partition',
      OFFSET: 'messaging.kafka.message.offset',
      MESSAGE_KEY: 'messaging.kafka.message.key'
    },
    rabbitmq: {
      ROUTING_KEY: 'messaging.rabbitmq.destination.routing_key',
      MESSAGE_ROUTING_KEY: 'messaging.rabbitmq.message.routing_key'
    },
    gcp: {
      PROJECT_ID: 'gcp.project_id'
    }
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
    PEER_NAME: 'net.peer.name',
    PEER_PORT: 'net.peer.port',
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
    PEER_NAME: 'net.peer.name',
    PEER_PORT: 'net.peer.port'
  }
};

// INSTANA -> OTLP MAPPING
const MAPPINGS = {
  http: [
    { otlp: OTLP.http.REQUEST_METHOD, instanaKey: 'operation', transform: toUpperCase },
    { otlp: OTLP.http.REQUEST_METHOD, instanaKey: 'method', transform: toUpperCase },
    { otlp: OTLP.http.URL_PATH, instanaKey: 'endpoints' },
    { otlp: OTLP.http.SERVER_ADDRESS, instanaKey: 'connection' },
    { otlp: OTLP.http.URL_FULL, instanaKey: 'url' },
    { otlp: OTLP.http.RESPONSE_STATUS, instanaKey: 'status' },
    { otlp: OTLP.http.URL_QUERY, instanaKey: 'params' },
    { otlp: OTLP.http.REQUEST_HEADER, instanaKey: 'header' },
    { otlp: OTLP.http.URL_TEMPLATE, instanaKey: 'path_tpl' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  kafka: [
    { otlp: OTLP.messaging.SYSTEM, value: 'kafka' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'endpoints' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'service' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instanaKey: 'operation' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instanaKey: 'access' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  rabbitmq: [
    { otlp: OTLP.messaging.SYSTEM, value: 'rabbitmq' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instanaKey: 'sort' },
    { otlp: OTLP.messaging.SERVER_ADDRESS, instanaKey: 'address' },
    { otlp: OTLP.messaging.rabbitmq.ROUTING_KEY, instanaKey: 'exchange' },
    { otlp: OTLP.messaging.rabbitmq.MESSAGE_ROUTING_KEY, instanaKey: 'key' }
  ],

  nats: [
    { otlp: OTLP.messaging.SYSTEM, value: 'nats' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instanaKey: 'sort' },
    { otlp: OTLP.messaging.SERVER_ADDRESS, instanaKey: 'address' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'subject' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  bull: [
    { otlp: OTLP.messaging.SYSTEM, value: 'bull' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instanaKey: 'sort' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'queue' },
    { otlp: OTLP.messaging.MESSAGE_ID, instanaKey: 'messageId' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  sqs: [
    { otlp: OTLP.messaging.SYSTEM, value: 'aws.sqs' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instanaKey: 'sort' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instanaKey: 'type' },
    { otlp: OTLP.messaging.CONSUMER_GROUP, instanaKey: 'group' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'queue' },
    { otlp: OTLP.messaging.MESSAGE_BODY_SIZE, instanaKey: 'size' },
    { otlp: OTLP.messaging.MESSAGE_ID, instanaKey: 'messageId' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  sns: [
    { otlp: OTLP.messaging.SYSTEM, value: 'aws.sns' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'topic' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'subject' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'phone' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'target' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  gcps: [
    { otlp: OTLP.messaging.SYSTEM, value: 'gcp.pubsub' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instanaKey: 'op' },
    { otlp: OTLP.messaging.gcp.PROJECT_ID, instanaKey: 'projid' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'top' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instanaKey: 'sub' },
    { otlp: OTLP.messaging.MESSAGE_ID, instanaKey: 'messageId' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  pg: [
    { otlp: OTLP.database.SYSTEM, value: 'postgresql' },
    { otlp: OTLP.database.STATEMENT, instanaKey: 'stmt' },
    { otlp: OTLP.database.PEER_NAME, instanaKey: 'host' },
    { otlp: OTLP.database.PEER_PORT, instanaKey: 'port' },
    { otlp: OTLP.database.USER, instanaKey: 'user' },
    { otlp: OTLP.database.NAME, instanaKey: 'db' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  mysql: [
    { otlp: OTLP.database.SYSTEM, value: 'mysql' },
    { otlp: OTLP.database.STATEMENT, instanaKey: 'stmt' },
    { otlp: OTLP.database.PEER_NAME, instanaKey: 'host' },
    { otlp: OTLP.database.PEER_PORT, instanaKey: 'port' },
    { otlp: OTLP.database.USER, instanaKey: 'user' },
    { otlp: OTLP.database.NAME, instanaKey: 'db' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  mssql: [
    { otlp: OTLP.database.SYSTEM, value: 'mssql' },
    { otlp: OTLP.database.STATEMENT, instanaKey: 'stmt' },
    { otlp: OTLP.database.PEER_NAME, instanaKey: 'host' },
    { otlp: OTLP.database.PEER_PORT, instanaKey: 'port' },
    { otlp: OTLP.database.USER, instanaKey: 'user' },
    { otlp: OTLP.database.NAME, instanaKey: 'db' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  mongo: [
    { otlp: OTLP.database.SYSTEM, value: 'mongodb' },
    { otlp: OTLP.database.OPERATION, instanaKey: 'command' },
    { otlp: OTLP.database.SERVER_ADDRESS, instanaKey: 'service' },
    { otlp: OTLP.database.NAMESPACE, instanaKey: 'namespace' },
    { otlp: OTLP.database.STATEMENT, instanaKey: 'json' },
    { otlp: OTLP.database.STATEMENT, instanaKey: 'filter' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  peer: [
    { otlp: OTLP.network.PEER_NAME, instanaKey: 'hostname' },
    { otlp: OTLP.network.PEER_PORT, instanaKey: 'port' }
  ],

  redis: [
    { otlp: OTLP.database.SYSTEM, value: 'redis' },
    { otlp: OTLP.database.SERVER_ADDRESS, instanaKey: 'connection' },
    { otlp: OTLP.database.OPERATION, instanaKey: 'operation' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
    // subCommands — no OTLP key
  ],

  couchbase: [
    { otlp: OTLP.database.SYSTEM, value: 'couchbase' },
    { otlp: OTLP.database.PEER_NAME, instanaKey: 'hostname' },
    { otlp: OTLP.database.COLLECTION, instanaKey: 'bucket' },
    // type — no OTLP key
    { otlp: OTLP.database.STATEMENT, instanaKey: 'sql' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  elasticsearch: [
    { otlp: OTLP.database.SYSTEM, value: 'elasticsearch' },
    { otlp: OTLP.database.OPERATION, instanaKey: 'action' },
    { otlp: OTLP.database.SERVER_ADDRESS, instanaKey: 'cluster' },
    { otlp: OTLP.database.SERVER_ADDRESS, instanaKey: 'endpoint' },
    { otlp: OTLP.database.PEER_NAME, instanaKey: 'address' },
    { otlp: OTLP.database.PEER_PORT, instanaKey: 'port' },
    { otlp: OTLP.database.COLLECTION, instanaKey: 'index' },
    { otlp: OTLP.database.NAMESPACE, instanaKey: 'type' },
    { otlp: OTLP.database.NAME, instanaKey: 'id' },
    { otlp: OTLP.database.STATEMENT, instanaKey: 'query' },
    // hits — no OTLP key
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  dynamodb: [
    { otlp: OTLP.database.SYSTEM, value: 'dynamodb' },
    { otlp: OTLP.database.OPERATION, instanaKey: 'operation' },
    { otlp: OTLP.cloud.REGION, instanaKey: 'region' },
    { otlp: OTLP.database.NAME, instanaKey: 'table' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  db2: [
    { otlp: OTLP.database.SYSTEM, value: 'db2' },
    { otlp: OTLP.database.STATEMENT, instanaKey: 'stmt' },
    { otlp: OTLP.database.CONNECTION_STRING, instanaKey: 'dsn' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  memcached: [
    { otlp: OTLP.database.SYSTEM, value: 'memcached' },
    { otlp: OTLP.database.STATEMENT, instanaKey: 'key' },
    { otlp: OTLP.database.SERVER_ADDRESS, instanaKey: 'connection' },
    { otlp: OTLP.database.OPERATION, instanaKey: 'operation' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  prisma: [
    { otlp: OTLP.database.SYSTEM, instanaKey: 'provider', value: 'other_sql' },
    { otlp: OTLP.database.COLLECTION, instanaKey: 'model' },
    { otlp: OTLP.database.OPERATION, instanaKey: 'action' },
    { otlp: OTLP.database.CONNECTION_STRING, instanaKey: 'url' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  rpc: [
    { otlp: OTLP.rpc.METHOD, instanaKey: 'call' },
    { otlp: OTLP.rpc.SYSTEM, instanaKey: 'flavor' },
    { otlp: OTLP.network.PEER_NAME, instanaKey: 'host' },
    { otlp: OTLP.network.PEER_PORT, instanaKey: 'port' },
    { otlp: OTLP.rpc.GRPC_ERROR, instanaKey: 'error' }
  ],

  graphql: [
    { otlp: OTLP.graphql.OPERATION_NAME, instanaKey: 'operationName' },
    { otlp: OTLP.graphql.OPERATION_TYPE, instanaKey: 'operationType' }
    // fields — no OTLP key
    // args — no OTLP key
    // errors — no OTLP key
  ],

  log: [
    { otlp: OTLP.log.BODY, instanaKey: 'message' },
    { otlp: OTLP.log.SEVERITY, instanaKey: 'level' }
  ],

  gcs: [
    { otlp: OTLP.database.OPERATION, instanaKey: 'op' },
    { otlp: OTLP.cloud.gcp.STORAGE_BUCKET, instanaKey: 'bucket' },
    { otlp: OTLP.cloud.gcp.STORAGE_OBJECT, instanaKey: 'object' },
    { otlp: OTLP.cloud.gcp.PROJECT_ID, instanaKey: 'projectId' },
    // accessId — no OTLP key
    { otlp: OTLP.cloud.gcp.STORAGE_SOURCE_BUCKET, instanaKey: 'sourceBucket' },
    { otlp: OTLP.cloud.gcp.STORAGE_SOURCE_OBJECT, instanaKey: 'sourceObject' },
    { otlp: OTLP.cloud.gcp.STORAGE_DESTINATION_BUCKET, instanaKey: 'destinationBucket' },
    { otlp: OTLP.cloud.gcp.STORAGE_DESTINATION_OBJECT, instanaKey: 'destinationObject' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  s3: [
    { otlp: OTLP.database.OPERATION, instanaKey: 'op' },
    { otlp: OTLP.cloud.aws.S3_BUCKET, instanaKey: 'bucket' },
    { otlp: OTLP.cloud.aws.S3_KEY, instanaKey: 'key' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  kinesis: [
    { otlp: OTLP.messaging.SYSTEM, value: 'aws.kinesis' },
    { otlp: OTLP.database.OPERATION, instanaKey: 'op' },
    { otlp: OTLP.cloud.aws.KINESIS_STREAM, instanaKey: 'stream' },
    { otlp: OTLP.cloud.aws.KINESIS_EXPLICIT_HASH_KEY, instanaKey: 'record' },
    { otlp: OTLP.cloud.aws.KINESIS_SHARD_ITERATOR_TYPE, instanaKey: 'shardType' },
    { otlp: OTLP.cloud.aws.KINESIS_STARTING_SEQUENCE_NUMBER, instanaKey: 'startSequenceNumber' },
    { otlp: OTLP.cloud.aws.KINESIS_SHARD, instanaKey: 'shard' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  azstorage: [
    { otlp: OTLP.cloud.PROVIDER, value: 'azure' },
    { otlp: OTLP.database.OPERATION, instanaKey: 'op' },
    { otlp: OTLP.cloud.azure.STORAGE_ACCOUNT, instanaKey: 'accountName' },
    { otlp: OTLP.cloud.azure.CONTAINER, instanaKey: 'containerName' },
    { otlp: OTLP.cloud.azure.BLOB, instanaKey: 'blobName' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ],

  'aws.lambda.invoke': [
    { otlp: OTLP.faas.NAME, instanaKey: 'function' },
    { otlp: OTLP.faas.INVOCATION_TYPE, instanaKey: 'type' },
    { otlp: OTLP.http.ERROR_TYPE, instanaKey: 'error' }
  ]
};

const METADATA_MAPPINGS = {
  t: { key: 'traceId', value: convertTraceId },
  s: { key: 'spanId', value: convertSpanId },
  p: { key: 'parentSpanId', value: convertSpanId },
  k: { key: 'kind', value: convertSpanKind },
  ts: { key: 'startTimeUnixNano', value: convertStartTime },
  d: { key: 'endTimeUnixNano', value: convertEndTime },
  // Transformer-based fields (require transformer context)
  name: { key: 'name', getter: 'getSpanName' },
  status: { key: 'status', getter: 'getStatus' }
};

module.exports = {
  MAPPINGS,
  METADATA_MAPPINGS
};
