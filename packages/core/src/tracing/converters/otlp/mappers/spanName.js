/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { SPAN_TYPES } = require('../constants');

// we need to find any way to map this value better(eg: groups)
exports.SPAN_NAME_MAPPING = {
  [SPAN_TYPES.HTTP]: data => {
    const method = (data.method || 'HTTP').toUpperCase();
    return `${method} ${data.path_tpl || data.path || '/'}`;
  },

  [SPAN_TYPES.KAFKA]: data => `${data.access} ${data.service}`,

  [SPAN_TYPES.RABBITMQ]: data => `${data.sort || 'process'} ${data.exchange || data.key || 'unknown'}`,

  [SPAN_TYPES.NATS]: data => `${data.sort || 'process'} ${data.subject || 'unknown'}`,

  [SPAN_TYPES.BULL]: data => `${data.sort || 'process'} ${data.queue || 'unknown'}`,

  [SPAN_TYPES.SQS]: data => `${data.type || data.sort || 'process'} ${data.queue || 'unknown'}`,

  [SPAN_TYPES.SNS]: data => `publish ${data.topic || data.subject || 'unknown'}`,

  [SPAN_TYPES.GCPS]: data => `${data.op || 'process'} ${data.top || data.sub || 'unknown'}`,

  [SPAN_TYPES.PG]: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'POSTGRESQL',

  [SPAN_TYPES.MYSQL]: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'MYSQL',

  [SPAN_TYPES.MSSQL]: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'MSSQL',

  [SPAN_TYPES.DB2]: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'DB2',

  [SPAN_TYPES.MONGO]: data => `mongo.${data.command}`,

  [SPAN_TYPES.REDIS]: data => `redis.${data.operation || 'command'}`,

  [SPAN_TYPES.COUCHBASE]: data => `couchbase.${data.bucket || 'operation'}`,

  [SPAN_TYPES.ELASTICSEARCH]: data => `elasticsearch.${data.action || 'request'}`,

  [SPAN_TYPES.DYNAMODB]: data => `dynamodb.${data.operation || 'request'}`,

  [SPAN_TYPES.MEMCACHED]: data => `memcached.${data.operation || 'command'}`,

  [SPAN_TYPES.PRISMA]: data => `prisma.${data.action || 'query'}`,

  [SPAN_TYPES.RPC]: data => data.call || 'rpc.call',

  [SPAN_TYPES.GRAPHQL]: data =>
    data.operationName ? `${data.operationType || 'query'} ${data.operationName}` : data.operationType || 'graphql',

  [SPAN_TYPES.GCS]: data => `gcs.${data.op || 'operation'}`,

  [SPAN_TYPES.S3]: data => `s3.${data.op || 'operation'}`,

  [SPAN_TYPES.KINESIS]: data => `kinesis.${data.op || 'operation'}`,

  [SPAN_TYPES.AZSTORAGE]: data => `azure.storage.${data.op || 'operation'}`,

  [SPAN_TYPES.AWS_LAMBDA_INVOKE]: data => (data.function ? `Invoke ${data.function}` : 'Lambda Invoke')
};
