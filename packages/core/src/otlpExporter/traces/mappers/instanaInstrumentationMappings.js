/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { toUpperCase, firstDefined, formatOTLPValue, combineFields, extractHost, extractPort } = require('./util');

const ctx = require('../../common/context');
const { INSTRUMENTATION_TYPES, STATUS_CODES, SPECIAL_SPAN_TYPES } = require('./constants');

const OTLP = /** @type {any} */ (ctx.semConv);

/**
 * @typedef {Object} OTLPFormattedValue
 * @property {string} [stringValue]
 * @property {number} [intValue]
 * @property {number} [doubleValue]
 * @property {boolean} [boolValue]
 */

/**
 * @typedef {Object} SpanAttribute
 * @property {string} key
 * @property {OTLPFormattedValue} value
 */

/**
 * @typedef {(values: any, spanData?: Record<string, any>) => any} TransformFunction
 */

/**
 * @typedef {Object} AttributeMapping
 * @property {string} otlp
 * @property {string | string[]} [instana]
 * @property {any} [value]
 * @property {TransformFunction} [transform]
 */

/**
 * @typedef {(data: Record<string, any>) => string} SpanNameFunction
 */

/**
 * @typedef {Object} InstrumentationMapping
 * @property {SpanNameFunction} [spanName]
 * @property {AttributeMapping[]} [spanAttributes]
 */

/**
 * @typedef {Record<string, InstrumentationMapping>} InstrumentationMappings
 */

/** @type {InstrumentationMappings} */
const instrumentationMappings = {
  [INSTRUMENTATION_TYPES.HTTP]: {
    spanName: data => {
      const method = (data.operation || data.method || '').toUpperCase();
      return `${method} ${data.path_tpl || data.path || '/'}`;
    },
    spanAttributes: [
      {
        otlp: OTLP.http.REQUEST_METHOD,
        instana: ['operation', 'method'],
        transform: values => {
          const value = firstDefined(values);
          return value ? toUpperCase(value) : value;
        }
      },
      { otlp: OTLP.http.URL_FULL, instana: ['endpoints', 'url'] },
      { otlp: OTLP.http.URL_PATH, instana: 'path' },
      { otlp: OTLP.http.URL_QUERY, instana: 'params' },
      {
        otlp: OTLP.http.SERVER_ADDRESS,
        instana: ['connection', 'host'],
        transform: values => {
          const value = firstDefined(values);
          return value ? extractHost(value) : undefined;
        }
      },
      {
        otlp: OTLP.http.SERVER_PORT,
        instana: ['connection', 'host'],
        transform: values => {
          const value = firstDefined(values);
          return value ? extractPort(value) : undefined;
        }
      },
      { otlp: OTLP.http.RESPONSE_STATUS, instana: 'status' },
      { otlp: OTLP.http.REQUEST_HEADER, instana: 'header' },
      { otlp: OTLP.http.URL_TEMPLATE, instana: 'path_tpl' },
      { otlp: OTLP.http.ROUTE, instana: 'route' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.KAFKA]: {
    // In KafkaNode, we collect service directly
    spanName: data => `${data.operation} ${data.service || data.endpoints}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: 'kafka' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: ['service', 'endpoints'], transform: firstDefined },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: ['access', 'operation'], transform: firstDefined },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.RABBITMQ]: {
    spanName: data => `${data.sort || 'process'} ${data.exchange || data.key || data.queue || 'unknown'}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: 'rabbitmq' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'sort' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: ['exchange', 'key', 'queue'] },
      { otlp: OTLP.messaging.SERVER_ADDRESS, instana: 'address', transform: extractHost },
      { otlp: OTLP.messaging.SERVER_PORT, instana: 'address', transform: extractPort },
      { otlp: OTLP.messaging.rabbitmq.ROUTING_KEY, instana: 'exchange' },
      { otlp: OTLP.messaging.rabbitmq.MESSAGE_ROUTING_KEY, instana: 'key' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.NATS]: {
    spanName: data => `${data.sort || 'process'} ${data.subject || 'unknown'}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: 'nats' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'subject' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'sort' },
      { otlp: OTLP.messaging.SERVER_ADDRESS, instana: 'address', transform: extractHost },
      { otlp: OTLP.messaging.SERVER_PORT, instana: 'address', transform: extractPort },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.BULL]: {
    spanName: data => `${data.sort || 'process'} ${data.queue || 'unknown'}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: 'bull' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'sort' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'queue' },
      { otlp: OTLP.messaging.MESSAGE_ID, instana: 'messageId' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.SQS]: {
    spanName: data => `${data.type || data.sort || 'process'} ${data.queue || 'unknown'}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: OTLP.messaging.sqs?.SYSTEM || 'aws.sqs' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'type' },
      { otlp: OTLP.messaging.CONSUMER_GROUP, instana: 'group' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'queue' },
      { otlp: OTLP.messaging.MESSAGE_BODY_SIZE, instana: 'size' },
      { otlp: OTLP.messaging.MESSAGE_ID, instana: 'messageId' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.SNS]: {
    spanName: data => `publish ${data.topic || data.subject || 'unknown'}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: 'aws.sns' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'topic' },
      { otlp: OTLP.messaging.OPERATION_NAME, value: 'send' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  // Entry and Exit
  [INSTRUMENTATION_TYPES.GCPS]: {
    spanName: data => `${data.op || 'process'} ${data.top || data.sub || 'unknown'}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: OTLP.messaging.gcp?.SYSTEM || 'gcp.pubsub' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'op' },
      {
        otlp: OTLP.messaging.DESTINATION_NAME,
        instana: ['top', 'sub'],
        transform: firstDefined
      },
      { otlp: OTLP.messaging.gcp.PROJECT_ID, instana: 'projid' },
      { otlp: OTLP.messaging.MESSAGE_ID, instana: 'messageId' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.PG]: {
    spanName: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'POSTGRESQL',
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'postgresql' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.database.SERVER_ADDRESS, instana: 'host' },
      { otlp: OTLP.database.SERVER_PORT, instana: 'port' },
      { otlp: OTLP.database.USER, instana: 'user' },
      { otlp: OTLP.database.NAME, instana: 'db' },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MYSQL]: {
    spanName: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'MYSQL',
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'mysql' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.database.SERVER_ADDRESS, instana: 'host' },
      { otlp: OTLP.database.SERVER_PORT, instana: 'port' },
      { otlp: OTLP.database.USER, instana: 'user' },
      { otlp: OTLP.database.NAME, instana: 'db' },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MSSQL]: {
    spanName: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'MSSQL',
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'mssql' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.database.SERVER_ADDRESS, instana: 'host' },
      { otlp: OTLP.database.SERVER_PORT, instana: 'port' },
      { otlp: OTLP.database.USER, instana: 'user' },
      { otlp: OTLP.database.NAME, instana: 'db' },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.DB2]: {
    spanName: data => data.stmt?.split(/\s+/)[0]?.toUpperCase() || 'DB2',
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'db2' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.database.SERVER_ADDRESS, instana: 'host' },
      { otlp: OTLP.database.SERVER_PORT, instana: 'port' },
      { otlp: OTLP.database.USER, instana: 'user' },
      { otlp: OTLP.database.NAME, instana: 'db' },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MONGO]: {
    spanName: data => `mongo.${data.command}`,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'mongodb' },
      { otlp: OTLP.database.NAMESPACE, instana: 'namespace' },
      { otlp: OTLP.database.COLLECTION, instana: 'collection' },
      { otlp: OTLP.database.OPERATION, instana: 'command', transform: toUpperCase },
      { otlp: OTLP.database.SERVER_ADDRESS, instana: 'service', transform: extractHost },
      { otlp: OTLP.database.SERVER_PORT, instana: 'service', transform: extractPort },
      { otlp: OTLP.database.QUERY_TEXT, instana: ['json', 'filter'], transform: firstDefined },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.REDIS]: {
    spanName: data => `redis.${data.operation || 'command'}`,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'redis' },
      { otlp: OTLP.database.OPERATION, instana: 'operation' },
      { otlp: OTLP.database.CONNECTION, instana: 'connection' },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.COUCHBASE]: {
    spanName: data => `couchbase.${data.bucket || 'operation'}`,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'other_nosql' },
      { otlp: OTLP.database.NAME, instana: 'bucket' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'sql' },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.ELASTICSEARCH]: {
    spanName: data => `elasticsearch.${data.action || 'request'}`,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'elasticsearch' },
      { otlp: OTLP.database.OPERATION, instana: 'action' },
      { otlp: OTLP.database.NAME, instana: 'cluster' },
      { otlp: OTLP.database.COLLECTION, instana: 'index' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'query' },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.DYNAMODB]: {
    spanName: data => `dynamodb.${data.operation || 'request'}`,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'dynamodb' },
      { otlp: OTLP.database.OPERATION, instana: 'operation' },
      { otlp: OTLP.cloud.REGION, instana: 'region' },
      { otlp: OTLP.database.COLLECTION, instana: 'table' },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MEMCACHED]: {
    spanName: data => `memcached.${data.operation || 'command'}`,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'memcached' },
      { otlp: OTLP.database.CONNECTION, instana: 'connection' },
      { otlp: OTLP.database.OPERATION, instana: 'operation' },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },
  // Note: There is no official OpenTelemetry semantic convention for Prisma, and it is not covered in our RFD either.
  // We can therefore adopt a generic database convention, using the Prisma provider as the database system identifier.
  [INSTRUMENTATION_TYPES.PRISMA]: {
    spanName: data => `prisma.${data.action || 'query'}`,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, instana: 'provider' },
      { otlp: OTLP.database.COLLECTION, instana: 'model' },
      { otlp: OTLP.database.OPERATION, instana: 'action' },
      { otlp: OTLP.database.CONNECTION, instana: 'url' },
      { otlp: OTLP.database.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.RPC]: {
    spanName: data => data.call || 'rpc.call',
    spanAttributes: [
      { otlp: OTLP.rpc.METHOD, instana: 'call' },
      { otlp: OTLP.rpc.SYSTEM, instana: 'flavor' },
      { otlp: OTLP.network.PEER_NAME, instana: 'host' },
      { otlp: OTLP.network.PEER_PORT, instana: 'port' },
      { otlp: OTLP.rpc.GRPC_ERROR, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.GRAPHQL]: {
    spanName: data =>
      data.operationName ? `${data.operationType || 'query'} ${data.operationName}` : data.operationType || 'graphql',
    spanAttributes: [
      { otlp: OTLP.graphql.OPERATION_NAME, instana: 'operationName' },
      { otlp: OTLP.graphql.OPERATION_TYPE, instana: 'operationType' }
    ]
  },

  [INSTRUMENTATION_TYPES.GCS]: {
    spanName: data => `gcs.${data.op || 'operation'}`,
    spanAttributes: [
      { otlp: OTLP.database.OPERATION, instana: 'op' },
      { otlp: OTLP.cloud.gcp.STORAGE_BUCKET, instana: 'bucket' },
      { otlp: OTLP.cloud.gcp.STORAGE_OBJECT, instana: 'object' },
      { otlp: OTLP.cloud.gcp.PROJECT_ID, instana: 'projectId' },
      { otlp: OTLP.cloud.gcp.STORAGE_SOURCE_BUCKET, instana: 'sourceBucket' },
      { otlp: OTLP.cloud.gcp.STORAGE_SOURCE_OBJECT, instana: 'sourceObject' },
      { otlp: OTLP.cloud.gcp.STORAGE_DESTINATION_BUCKET, instana: 'destinationBucket' },
      { otlp: OTLP.cloud.gcp.STORAGE_DESTINATION_OBJECT, instana: 'destinationObject' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.S3]: {
    spanName: data => `s3.${data.op || 'operation'}`,
    spanAttributes: [
      { otlp: OTLP.database.OPERATION, instana: 'op' },
      { otlp: OTLP.cloud.aws.S3_BUCKET, instana: 'bucket' },
      { otlp: OTLP.cloud.aws.S3_KEY, instana: 'key' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.KINESIS]: {
    spanName: data => `kinesis.${data.op || 'operation'}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: 'aws.kinesis' },
      { otlp: OTLP.database.OPERATION, instana: 'op' },
      { otlp: OTLP.cloud.aws.KINESIS_STREAM, instana: 'stream' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'stream' },
      { otlp: OTLP.messaging.DESTINATION_PARTITION_ID, instana: 'shard' },
      { otlp: OTLP.cloud.aws.KINESIS_EXPLICIT_HASH_KEY, instana: 'record' },
      { otlp: OTLP.cloud.aws.KINESIS_SHARD_ITERATOR_TYPE, instana: 'shardType' },
      { otlp: OTLP.cloud.aws.KINESIS_STARTING_SEQUENCE_NUMBER, instana: 'startSequenceNumber' },
      { otlp: OTLP.cloud.aws.KINESIS_SHARD, instana: 'shard' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.AZSTORAGE]: {
    spanName: data => `azure.storage.${data.op || 'operation'}`,
    spanAttributes: [
      { otlp: OTLP.cloud.PROVIDER, value: 'azure' },
      { otlp: OTLP.database.OPERATION, instana: 'op' },
      { otlp: OTLP.cloud.azure.STORAGE_ACCOUNT, instana: 'accountName' },
      { otlp: OTLP.cloud.azure.CONTAINER, instana: 'containerName' },
      { otlp: OTLP.cloud.azure.BLOB, instana: 'blobName' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.AWS_LAMBDA_INVOKE]: {
    spanName: data => (data.function ? `Invoke ${data.function}` : 'Lambda Invoke'),
    spanAttributes: [
      { otlp: OTLP.faas.NAME, instana: 'function' },
      { otlp: OTLP.faas.INVOCATION_TYPE, instana: 'type' },
      { otlp: OTLP.http.ERROR_TYPE, instana: 'error' }
    ]
  },

  // PEER is special - only has attributes, no span name
  [INSTRUMENTATION_TYPES.PEER]: {
    spanAttributes: [
      { otlp: OTLP.network.PEER_NAME, instana: 'hostname' },
      { otlp: OTLP.network.PEER_PORT, instana: 'port' }
    ]
  }
};

/**
 * @param {import('../../../core').InstanaBaseSpan} span
 * @returns {string|null}
 */
function getSpanType(span) {
  if (!span || !span.data) {
    return null;
  }

  const key = Object.keys(span.data).find(k => k !== INSTRUMENTATION_TYPES.PEER && k !== SPECIAL_SPAN_TYPES.RESOURCE);

  return key || null;
}

/**
 *
 * @param {AttributeMapping} mapping
 * @param {Record<string, any>} spanData
 * @returns {SpanAttribute|null}
 */
function applyMapping(mapping, spanData) {
  if (!mapping) return null;

  let value;

  if (mapping.value !== undefined && !mapping.instana) {
    value = mapping.value;
  } else if (Array.isArray(mapping.instana)) {
    const values = mapping.instana.map(k => spanData?.[k]);

    value = mapping.transform ? mapping.transform(values, spanData) : combineFields(spanData, mapping.instana);
  } else if (typeof mapping.instana === 'string') {
    const rawValue = spanData?.[mapping.instana];

    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    value = mapping.transform ? mapping.transform(rawValue, spanData) : rawValue;
  } else {
    return null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  return {
    key: mapping.otlp,
    value: formatOTLPValue(value)
  };
}

module.exports = {
  /**
   * @param {import('../../../core').InstanaBaseSpan} span
   */
  spanName(span) {
    const type = getSpanType(span);
    const handler = instrumentationMappings[type]?.spanName;
    const spanData = type ? span.data?.[type] : null;

    if (typeof handler === 'function' && spanData) {
      return handler(spanData);
    }

    return span?.n || type || 'unknown';
  },

  /** @param {import('../../../core').InstanaBaseSpan} span */
  spanAttributes(span) {
    const attributes = [];
    const spanTypes = Object.keys(span.data || {});

    for (let i = 0; i < spanTypes.length; i++) {
      const spanType = spanTypes[i];

      if (spanType === SPECIAL_SPAN_TYPES.RESOURCE) {
        continue;
      }

      const handler = instrumentationMappings[spanType]?.spanAttributes;
      const spanData = span.data[spanType];

      if (!Array.isArray(handler) || !spanData) {
        continue;
      }

      for (let j = 0; j < handler.length; j++) {
        const attribute = applyMapping(handler[j], spanData);

        if (attribute) {
          attributes.push(attribute);
        }
      }
    }

    return attributes;
  },

  /**
   * @param {import('../../../core').InstanaBaseSpan} span
   */
  spanStatus(span) {
    const type = getSpanType(span);
    const data = type ? span.data?.[type] : null;

    // Special case: HTTP client 4xx responses are reported as errors according to OTel semantic conventions, even
    // though Instana leaves span.ec unset for these responses. We handled it here.
    // Remove this handling once INSTA-98209 is implemented.
    const shouldReportHttpClientAsError = span.n === 'node.http.client' && data?.status >= 400 && data?.status < 500;

    if (!span?.ec && !shouldReportHttpClientAsError) {
      return { code: STATUS_CODES.UNSET };
    }

    return {
      code: STATUS_CODES.ERROR,
      message: String(data?.error || `${type || span?.n || 'operation'} failed`)
    };
  }
};
