/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { INSTRUMENTATION_SCOPE_NAME } = require('../../common/constants');

exports.INSTRUMENTATION_SCOPE_NAME = INSTRUMENTATION_SCOPE_NAME;

exports.INSTRUMENTATION_TYPES = {
  HTTP: 'http',
  KAFKA: 'kafka',
  RABBITMQ: 'rabbitmq',
  NATS: 'nats',
  BULL: 'bull',
  SQS: 'sqs',
  SNS: 'sns',
  GCPS: 'gcps',
  PG: 'pg',
  MYSQL: 'mysql',
  MSSQL: 'mssql',
  MONGO: 'mongo',
  PEER: 'peer',
  REDIS: 'redis',
  COUCHBASE: 'couchbase',
  ELASTICSEARCH: 'elasticsearch',
  DYNAMODB: 'dynamodb',
  DB2: 'db2',
  MEMCACHED: 'memcached',
  PRISMA: 'prisma',
  RPC: 'rpc',
  GRAPHQL: 'graphql',
  GCS: 'gcs',
  S3: 's3',
  KINESIS: 'kinesis',
  AZSTORAGE: 'azstorage',
  AWS_LAMBDA_INVOKE: 'aws.lambda.invoke'
};

exports.OTLP_STATUS_CODES = {
  UNSET: 0,
  OK: 1,
  ERROR: 2
};

exports.OTLP_SPAN_KINDS = {
  UNSPECIFIED: 0,
  INTERNAL: 1,
  SERVER: 2,
  CLIENT: 3,
  PRODUCER: 4,
  CONSUMER: 5
};

exports.SPECIAL_SPAN_DATA_TYPES = {
  RESOURCE: 'resource',
  TAGS: 'tags',
  OTEL: 'otel'
};

exports.INSTANA_SPAN_KINDS = {
  ENTRY: 1,
  EXIT: 2,
  INTERMEDIATE: 3
};
