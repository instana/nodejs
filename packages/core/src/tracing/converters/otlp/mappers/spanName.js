/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { INSTRUMENTATION_TYPES } = require('../constants');

// we need to find a way to map this value better(eg: groups)
exports.SPAN_NAME_MAPPING = {
  [INSTRUMENTATION_TYPES.HTTP]: data => {
    const method = (data.method || 'HTTP').toUpperCase();
    return `${method} ${data.path_tpl || data.path || '/'}`;
  },

  [INSTRUMENTATION_TYPES.KAFKA]: data => `${data.access} ${data.service}`,

  [INSTRUMENTATION_TYPES.RABBITMQ]: data => `${data.sort || 'process'} ${data.exchange || data.key || 'unknown'}`,

  [INSTRUMENTATION_TYPES.NATS]: data => `${data.sort || 'process'} ${data.subject || 'unknown'}`,

  [INSTRUMENTATION_TYPES.BULL]: data => `${data.sort || 'process'} ${data.queue || 'unknown'}`,

  [INSTRUMENTATION_TYPES.SQS]: data => `${data.type || data.sort || 'process'} ${data.queue || 'unknown'}`,

  [INSTRUMENTATION_TYPES.SNS]: data => `publish ${data.topic || data.subject || 'unknown'}`,

  [INSTRUMENTATION_TYPES.GCPS]: data => `${data.op || 'process'} ${data.top || data.sub || 'unknown'}`,

  [INSTRUMENTATION_TYPES.PG]: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'POSTGRESQL',

  [INSTRUMENTATION_TYPES.MYSQL]: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'MYSQL',

  [INSTRUMENTATION_TYPES.MSSQL]: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'MSSQL',

  [INSTRUMENTATION_TYPES.DB2]: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'DB2',

  [INSTRUMENTATION_TYPES.MONGO]: data => `mongo.${data.command}`,

  [INSTRUMENTATION_TYPES.REDIS]: data => `redis.${data.operation || 'command'}`,

  [INSTRUMENTATION_TYPES.COUCHBASE]: data => `couchbase.${data.bucket || 'operation'}`,

  [INSTRUMENTATION_TYPES.ELASTICSEARCH]: data => `elasticsearch.${data.action || 'request'}`,

  [INSTRUMENTATION_TYPES.DYNAMODB]: data => `dynamodb.${data.operation || 'request'}`,

  [INSTRUMENTATION_TYPES.MEMCACHED]: data => `memcached.${data.operation || 'command'}`,

  [INSTRUMENTATION_TYPES.PRISMA]: data => `prisma.${data.action || 'query'}`,

  [INSTRUMENTATION_TYPES.RPC]: data => data.call || 'rpc.call',

  [INSTRUMENTATION_TYPES.GRAPHQL]: data =>
    data.operationName ? `${data.operationType || 'query'} ${data.operationName}` : data.operationType || 'graphql',

  [INSTRUMENTATION_TYPES.GCS]: data => `gcs.${data.op || 'operation'}`,

  [INSTRUMENTATION_TYPES.S3]: data => `s3.${data.op || 'operation'}`,

  [INSTRUMENTATION_TYPES.KINESIS]: data => `kinesis.${data.op || 'operation'}`,

  [INSTRUMENTATION_TYPES.AZSTORAGE]: data => `azure.storage.${data.op || 'operation'}`,

  [INSTRUMENTATION_TYPES.AWS_LAMBDA_INVOKE]: data => (data.function ? `Invoke ${data.function}` : 'Lambda Invoke')
};
