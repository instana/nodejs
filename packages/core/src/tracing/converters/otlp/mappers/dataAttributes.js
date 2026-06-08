/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { toUpperCase, combineHostPort } = require('../util');
const { getLookupConfig } = require('../semcov');
const OTLP = getLookupConfig();

// these 1:1 mapping check in detail
// it seems not accurate
const MAPPINGS = {
  http: [
    { otlp: OTLP.http.REQUEST_METHOD, instana: 'method', transform: toUpperCase },
    { otlp: OTLP.http.URL_PATH, instana: 'path' },
    { otlp: OTLP.http.SERVER_ADDRESS, instana: 'connection' },
    { otlp: OTLP.http.URL_FULL, instana: 'url' },
    { otlp: OTLP.http.RESPONSE_STATUS, instana: 'status' },
    { otlp: OTLP.http.URL_QUERY, instana: 'params' },
    { otlp: OTLP.http.REQUEST_HEADER, instana: 'header' },
    { otlp: OTLP.http.URL_TEMPLATE, instana: 'path_tpl' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  kafka: [
    { otlp: OTLP.messaging.SYSTEM, value: 'kafka' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'access' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instana: 'operation' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instana: 'access' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  rabbitmq: [
    { otlp: OTLP.messaging.SYSTEM, value: 'rabbitmq' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instana: 'sort' },
    { otlp: OTLP.messaging.SERVER_ADDRESS, instana: 'address' },
    { otlp: OTLP.messaging.rabbitmq.ROUTING_KEY, instana: 'exchange' },
    { otlp: OTLP.messaging.rabbitmq.MESSAGE_ROUTING_KEY, instana: 'key' }
  ],

  nats: [
    { otlp: OTLP.messaging.SYSTEM, value: 'nats' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instana: 'sort' },
    { otlp: OTLP.messaging.SERVER_ADDRESS, instana: 'address' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'subject' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  bull: [
    { otlp: OTLP.messaging.SYSTEM, value: 'bull' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instana: 'sort' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'queue' },
    { otlp: OTLP.messaging.MESSAGE_ID, instana: 'messageId' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  sqs: [
    { otlp: OTLP.messaging.SYSTEM, value: 'aws.sqs' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instana: 'sort' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instana: 'type' },
    { otlp: OTLP.messaging.CONSUMER_GROUP, instana: 'group' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'queue' },
    { otlp: OTLP.messaging.MESSAGE_BODY_SIZE, instana: 'size' },
    { otlp: OTLP.messaging.MESSAGE_ID, instana: 'messageId' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  sns: [
    { otlp: OTLP.messaging.SYSTEM, value: 'aws.sns' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'topic' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'subject' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'phone' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'target' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  gcps: [
    { otlp: OTLP.messaging.SYSTEM, value: 'gcp.pubsub' },
    { otlp: OTLP.messaging.OPERATION_TYPE, instana: 'op' },
    { otlp: OTLP.messaging.gcp.PROJECT_ID, instana: 'projid' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'top' },
    { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'sub' },
    { otlp: OTLP.messaging.MESSAGE_ID, instana: 'messageId' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  pg: [
    { otlp: OTLP.database.SYSTEM, value: 'postgresql' },
    { otlp: OTLP.database.STATEMENT, instana: 'stmt' },
    {
      otlp: OTLP.database.SERVER_ADDRESS,
      transform: combineHostPort,
      instanas: ['host', 'port']
    },
    { otlp: OTLP.database.PEER_NAME, instana: 'host' },
    { otlp: OTLP.database.PEER_PORT, instana: 'port' },
    { otlp: OTLP.database.USER, instana: 'user' },
    { otlp: OTLP.database.NAME, instana: 'db' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  mysql: [
    { otlp: OTLP.database.SYSTEM, value: 'mysql' },
    { otlp: OTLP.database.STATEMENT, instana: 'stmt' },
    { otlp: OTLP.database.PEER_NAME, instana: 'host' },
    { otlp: OTLP.database.PEER_PORT, instana: 'port' },
    { otlp: OTLP.database.USER, instana: 'user' },
    { otlp: OTLP.database.NAME, instana: 'db' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  mssql: [
    { otlp: OTLP.database.SYSTEM, value: 'mssql' },
    { otlp: OTLP.database.STATEMENT, instana: 'stmt' },
    { otlp: OTLP.database.PEER_NAME, instana: 'host' },
    { otlp: OTLP.database.PEER_PORT, instana: 'port' },
    { otlp: OTLP.database.USER, instana: 'user' },
    { otlp: OTLP.database.NAME, instana: 'db' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  mongo: [
    { otlp: OTLP.database.SYSTEM, value: 'mongodb' },
    { otlp: OTLP.database.OPERATION, instana: 'command' },
    { otlp: OTLP.database.SERVER_ADDRESS, instana: 'service' },
    { otlp: OTLP.database.NAMESPACE, instana: 'namespace' },
    { otlp: OTLP.database.STATEMENT, instana: 'json' },
    { otlp: OTLP.database.STATEMENT, instana: 'filter' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  peer: [
    { otlp: OTLP.network.PEER_NAME, instana: 'hostname' },
    { otlp: OTLP.network.PEER_PORT, instana: 'port' }
  ],

  redis: [
    { otlp: OTLP.database.SYSTEM, value: 'redis' },
    { otlp: OTLP.database.SERVER_ADDRESS, instana: 'connection' },
    { otlp: OTLP.database.OPERATION, instana: 'operation' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    // subCommands — no OTLP key
  ],

  couchbase: [
    { otlp: OTLP.database.SYSTEM, value: 'couchbase' },
    { otlp: OTLP.database.PEER_NAME, instana: 'hostname' },
    { otlp: OTLP.database.COLLECTION, instana: 'bucket' },
    // type — no OTLP key
    { otlp: OTLP.database.STATEMENT, instana: 'sql' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  elasticsearch: [
    { otlp: OTLP.database.SYSTEM, value: 'elasticsearch' },
    { otlp: OTLP.database.OPERATION, instana: 'action' },
    { otlp: OTLP.database.SERVER_ADDRESS, instana: 'cluster' },
    { otlp: OTLP.database.SERVER_ADDRESS, instana: 'endpoint' },
    { otlp: OTLP.database.PEER_NAME, instana: 'address' },
    { otlp: OTLP.database.PEER_PORT, instana: 'port' },
    { otlp: OTLP.database.COLLECTION, instana: 'index' },
    { otlp: OTLP.database.NAMESPACE, instana: 'type' },
    { otlp: OTLP.database.NAME, instana: 'id' },
    { otlp: OTLP.database.STATEMENT, instana: 'query' },
    // hits — no OTLP key
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  dynamodb: [
    { otlp: OTLP.database.SYSTEM, value: 'dynamodb' },
    { otlp: OTLP.database.OPERATION, instana: 'operation' },
    { otlp: OTLP.cloud.REGION, instana: 'region' },
    { otlp: OTLP.database.NAME, instana: 'table' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  db2: [
    { otlp: OTLP.database.SYSTEM, value: 'db2' },
    { otlp: OTLP.database.STATEMENT, instana: 'stmt' },
    { otlp: OTLP.database.CONNECTION_STRING, instana: 'dsn' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  memcached: [
    { otlp: OTLP.database.SYSTEM, value: 'memcached' },
    { otlp: OTLP.database.STATEMENT, instana: 'key' },
    { otlp: OTLP.database.SERVER_ADDRESS, instana: 'connection' },
    { otlp: OTLP.database.OPERATION, instana: 'operation' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  prisma: [
    { otlp: OTLP.database.SYSTEM, instana: 'provider', value: 'other_sql' },
    { otlp: OTLP.database.COLLECTION, instana: 'model' },
    { otlp: OTLP.database.OPERATION, instana: 'action' },
    { otlp: OTLP.database.CONNECTION_STRING, instana: 'url' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  rpc: [
    { otlp: OTLP.rpc.METHOD, instana: 'call' },
    { otlp: OTLP.rpc.SYSTEM, instana: 'flavor' },
    { otlp: OTLP.network.PEER_NAME, instana: 'host' },
    { otlp: OTLP.network.PEER_PORT, instana: 'port' },
    { otlp: OTLP.rpc.GRPC_ERROR, instana: 'error' }
  ],

  graphql: [
    { otlp: OTLP.graphql.OPERATION_NAME, instana: 'operationName' },
    { otlp: OTLP.graphql.OPERATION_TYPE, instana: 'operationType' }
    // fields — no OTLP key
    // args — no OTLP key
    // errors — no OTLP key
  ],

  gcs: [
    { otlp: OTLP.database.OPERATION, instana: 'op' },
    { otlp: OTLP.cloud.gcp.STORAGE_BUCKET, instana: 'bucket' },
    { otlp: OTLP.cloud.gcp.STORAGE_OBJECT, instana: 'object' },
    { otlp: OTLP.cloud.gcp.PROJECT_ID, instana: 'projectId' },
    // accessId — no OTLP key
    { otlp: OTLP.cloud.gcp.STORAGE_SOURCE_BUCKET, instana: 'sourceBucket' },
    { otlp: OTLP.cloud.gcp.STORAGE_SOURCE_OBJECT, instana: 'sourceObject' },
    { otlp: OTLP.cloud.gcp.STORAGE_DESTINATION_BUCKET, instana: 'destinationBucket' },
    { otlp: OTLP.cloud.gcp.STORAGE_DESTINATION_OBJECT, instana: 'destinationObject' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  s3: [
    { otlp: OTLP.database.OPERATION, instana: 'op' },
    { otlp: OTLP.cloud.aws.S3_BUCKET, instana: 'bucket' },
    { otlp: OTLP.cloud.aws.S3_KEY, instana: 'key' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  kinesis: [
    { otlp: OTLP.messaging.SYSTEM, value: 'aws.kinesis' },
    { otlp: OTLP.database.OPERATION, instana: 'op' },
    { otlp: OTLP.cloud.aws.KINESIS_STREAM, instana: 'stream' },
    { otlp: OTLP.cloud.aws.KINESIS_EXPLICIT_HASH_KEY, instana: 'record' },
    { otlp: OTLP.cloud.aws.KINESIS_SHARD_ITERATOR_TYPE, instana: 'shardType' },
    { otlp: OTLP.cloud.aws.KINESIS_STARTING_SEQUENCE_NUMBER, instana: 'startSequenceNumber' },
    { otlp: OTLP.cloud.aws.KINESIS_SHARD, instana: 'shard' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  azstorage: [
    { otlp: OTLP.cloud.PROVIDER, value: 'azure' },
    { otlp: OTLP.database.OPERATION, instana: 'op' },
    { otlp: OTLP.cloud.azure.STORAGE_ACCOUNT, instana: 'accountName' },
    { otlp: OTLP.cloud.azure.CONTAINER, instana: 'containerName' },
    { otlp: OTLP.cloud.azure.BLOB, instana: 'blobName' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ],

  'aws.lambda.invoke': [
    { otlp: OTLP.faas.NAME, instana: 'function' },
    { otlp: OTLP.faas.INVOCATION_TYPE, instana: 'type' },
    { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
  ]
};

module.exports = MAPPINGS;
