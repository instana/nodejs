/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const {
  toUpperCase,
  firstDefined,
  formatOTLPValue,
  combineFields,
  extractHost,
  extractPort,
  getRPCMethod,
  getRPCMethodOriginal,
  toBoolean,
  getRegionFromArn,
  getAccountIdFromArn,
  buildFullUrl
} = require('./util');

const ctx = require('../../common/context');
const {
  INSTRUMENTATION_TYPES,
  OTLP_STATUS_CODES,
  SPECIAL_SPAN_DATA_TYPES,
  LAMBDA_TRIGGER_MAP
} = require('./constants');

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
 * @property {AttributeMapping[] | ((spanData: Record<string, any>) => SpanAttribute[])} [spanAttributes]
 */

/**
 * @typedef {Record<string, InstrumentationMapping>} InstrumentationMappings
 */

/** @type {InstrumentationMappings} */
const instrumentationMappings = {
  [INSTRUMENTATION_TYPES.HTTP]: {
    spanName: data => {
      const method = data.operation.toUpperCase();
      return `${method} ${data.path_tpl || data.path || '/'}`;
    },
    spanAttributes: [
      { otlp: OTLP.traces.http.REQUEST_METHOD, instana: 'operation', transform: toUpperCase },
      { otlp: OTLP.traces.http.URL_FULL, instana: ['endpoints', 'params'], transform: buildFullUrl },
      { otlp: OTLP.traces.http.URL_PATH, instana: 'path' },
      { otlp: OTLP.traces.http.URL_QUERY, instana: 'params' },
      { otlp: OTLP.traces.http.RESPONSE_STATUS, instana: 'status' },
      // TODO: Instana stores both request and response headers in the same `header` field.
      // We need an internal mechanism to distinguish between request and response headers.
      { otlp: OTLP.traces.http.REQUEST_HEADER, instana: 'header' },
      { otlp: OTLP.traces.http.URL_TEMPLATE, instana: 'path_tpl' },
      { otlp: OTLP.traces.http.ROUTE, instana: 'route' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'connection', transform: extractHost },
      { otlp: OTLP.traces.server.PORT, instana: 'connection', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.KAFKA]: {
    spanName: data => `${data.operation} ${data.endpoints}`,
    spanAttributes: [
      { otlp: OTLP.traces.messaging.SYSTEM, value: INSTRUMENTATION_TYPES.KAFKA },
      { otlp: OTLP.traces.messaging.DESTINATION_NAME, instana: 'endpoints' },
      { otlp: OTLP.traces.messaging.OPERATION_NAME, instana: 'operation' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.RABBITMQ]: {
    spanName: data => `${data.sort} ${data.exchange}`,
    spanAttributes: [
      { otlp: OTLP.traces.messaging.SYSTEM, value: INSTRUMENTATION_TYPES.RABBITMQ },
      { otlp: OTLP.traces.messaging.OPERATION_NAME, instana: 'sort' },
      { otlp: OTLP.traces.messaging.DESTINATION_NAME, instana: ['exchange', 'key'] },
      { otlp: OTLP.traces.messaging.rabbitmq.ROUTING_KEY, instana: 'key' },
      { otlp: OTLP.traces.messaging.MESSAGE_BODY_SIZE, instana: 'size' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'address', transform: extractHost },
      { otlp: OTLP.traces.server.PORT, instana: 'address', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.NATS]: {
    spanName: data => `${data.sort} ${data.subject}`,
    spanAttributes: [
      { otlp: OTLP.traces.messaging.SYSTEM, value: INSTRUMENTATION_TYPES.NATS },
      { otlp: OTLP.traces.messaging.DESTINATION_NAME, instana: 'subject' },
      { otlp: OTLP.traces.messaging.OPERATION_NAME, instana: 'sort' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'address', transform: extractHost },
      { otlp: OTLP.traces.server.PORT, instana: 'address', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.BULL]: {
    spanName: data => `${data.sort} ${data.queue}`,
    spanAttributes: [
      { otlp: OTLP.traces.messaging.SYSTEM, value: INSTRUMENTATION_TYPES.BULL },
      { otlp: OTLP.traces.messaging.OPERATION_NAME, instana: 'sort' },
      { otlp: OTLP.traces.messaging.DESTINATION_NAME, instana: 'queue' },
      { otlp: OTLP.traces.messaging.MESSAGE_ID, instana: 'messageId' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.SQS]: {
    spanName: data => `${data.sort} ${data.queue}`,
    spanAttributes: [
      { otlp: OTLP.traces.messaging.SYSTEM, value: 'aws_sqs' },
      { otlp: OTLP.traces.messaging.OPERATION_NAME, instana: 'type' },
      { otlp: OTLP.traces.messaging.DESTINATION_NAME, instana: 'queue' },
      { otlp: OTLP.traces.messaging.BATCH_MESSAGE_COUNT, instana: 'size' },
      { otlp: OTLP.traces.messaging.MESSAGE_ID, instana: 'messageId' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.SNS]: {
    spanName: data => `publish ${data.topic}`,
    spanAttributes: [
      { otlp: OTLP.traces.messaging.SYSTEM, value: 'aws.sns' },
      { otlp: OTLP.traces.messaging.DESTINATION_NAME, instana: 'topic' },
      // We don't have the actual operation name. Using "send" based on the RFD.
      { otlp: OTLP.traces.messaging.OPERATION_NAME, value: 'send' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.GCPS]: {
    spanName: data => `${data.op}`,
    spanAttributes: [
      { otlp: OTLP.traces.messaging.SYSTEM, value: 'gcp_pubsub' },
      { otlp: OTLP.traces.messaging.OPERATION_NAME, instana: 'op' },
      {
        otlp: OTLP.traces.messaging.DESTINATION_NAME,
        instana: ['top', 'sub'],
        transform: firstDefined
      },
      { otlp: OTLP.traces.cloud.gcp.PROJECT_ID, instana: 'projid' },
      { otlp: OTLP.traces.messaging.MESSAGE_ID, instana: 'messageId' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.PG]: {
    spanName: data => `pg.${data.stmt?.split(/\s+/)[0]?.toUpperCase()}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, value: 'postgresql' },
      { otlp: OTLP.traces.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.traces.database.USER, instana: 'user' },
      { otlp: OTLP.traces.database.NAMESPACE, instana: 'db' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'host' },
      { otlp: OTLP.traces.server.PORT, instana: 'port' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MYSQL]: {
    spanName: data => `mysql.${data.stmt?.split(/\s+/)[0]?.toUpperCase()}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, value: INSTRUMENTATION_TYPES.MYSQL },
      { otlp: OTLP.traces.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.traces.database.USER, instana: 'user' },
      { otlp: OTLP.traces.database.NAMESPACE, instana: 'db' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'host' },
      { otlp: OTLP.traces.server.PORT, instana: 'port' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MSSQL]: {
    spanName: data => `mssql.${data.stmt?.split(/\s+/)[0]?.toUpperCase()}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, value: INSTRUMENTATION_TYPES.MSSQL },
      { otlp: OTLP.traces.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.traces.database.USER, instana: 'user' },
      { otlp: OTLP.traces.database.NAMESPACE, instana: 'db' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'host' },
      { otlp: OTLP.traces.server.PORT, instana: 'port' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.DB2]: {
    spanName: data => `db2.${data.stmt?.split(/\s+/)[0]?.toUpperCase()}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, value: 'ibm.db2' },
      { otlp: OTLP.traces.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MONGO]: {
    spanName: data => `mongodb.${data.command}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, value: 'mongodb' },
      { otlp: OTLP.traces.database.NAMESPACE, instana: 'namespace' },
      { otlp: OTLP.traces.database.mongodb.COLLECTION, instana: 'collection' },
      { otlp: OTLP.traces.database.OPERATION_NAME, instana: 'command', transform: toUpperCase },
      { otlp: OTLP.traces.database.QUERY_TEXT, instana: ['json', 'filter'], transform: firstDefined },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'service', transform: extractHost },
      { otlp: OTLP.traces.server.PORT, instana: 'service', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.REDIS]: {
    spanName: data => `redis.${data.operation}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, value: INSTRUMENTATION_TYPES.REDIS },
      { otlp: OTLP.traces.database.OPERATION_NAME, instana: 'operation' },
      { otlp: OTLP.traces.database.CONNECTION_STRING, instana: 'connection' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'connection', transform: extractHost },
      { otlp: OTLP.traces.server.PORT, instana: 'connection', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.COUCHBASE]: {
    spanName: data => `couchbase.${data.stmt?.split(/\s+/)[0]?.toUpperCase()}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, value: [INSTRUMENTATION_TYPES.COUCHBASE] },
      { otlp: OTLP.traces.database.NAMESPACE, instana: 'bucket' },
      { otlp: OTLP.traces.database.QUERY_TEXT, instana: 'sql' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.ELASTICSEARCH]: {
    spanName: data => `elasticsearch.${data.action}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, value: INSTRUMENTATION_TYPES.ELASTICSEARCH },
      { otlp: OTLP.traces.database.OPERATION_NAME, instana: 'action' },
      { otlp: OTLP.traces.database.NAMESPACE, instana: 'cluster' },
      { otlp: OTLP.traces.database.COLLECTION_NAME, instana: 'index' },
      { otlp: OTLP.traces.database.QUERY_TEXT, instana: 'query' },
      { otlp: OTLP.traces.database.CONNECTION_STRING, instana: 'hostname' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'hostname', transform: extractHost },
      { otlp: OTLP.traces.server.PORT, instana: 'hostname', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.DYNAMODB]: {
    spanName: data => `dynamodb.${data.operation}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, value: 'aws.dynamodb' },
      { otlp: OTLP.traces.rpc.SYSTEM_NAME, value: 'aws-api' },
      { otlp: OTLP.traces.database.OPERATION_NAME, instana: 'operation' },
      { otlp: OTLP.traces.cloud.REGION, instana: 'region' },
      { otlp: OTLP.traces.database.dynamodb.COLLECTION_NAME, instana: 'table' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MEMCACHED]: {
    spanName: data => `memcached.${data.operation}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, value: INSTRUMENTATION_TYPES.MEMCACHED },
      { otlp: OTLP.traces.database.CONNECTION_STRING, instana: 'connection' },
      { otlp: OTLP.traces.database.OPERATION_NAME, instana: 'operation' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'connection', transform: extractHost },
      { otlp: OTLP.traces.server.PORT, instana: 'connection', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },
  // Note: There is no official OpenTelemetry semantic convention for Prisma, and it is not covered in our RFD either.
  // We can therefore adopt a generic database convention, using the Prisma provider as the database system identifier.
  [INSTRUMENTATION_TYPES.PRISMA]: {
    spanName: data => `prisma.${data.action}`,
    spanAttributes: [
      { otlp: OTLP.traces.database.SYSTEM_NAME, instana: 'provider' },
      { otlp: OTLP.traces.database.COLLECTION_NAME, instana: 'model' },
      { otlp: OTLP.traces.database.OPERATION_NAME, instana: 'action' },
      { otlp: OTLP.traces.database.CONNECTION_STRING, instana: 'url' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'url', transform: extractHost },
      { otlp: OTLP.traces.server.PORT, instana: 'url', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.RPC]: {
    spanName: data => data.call,
    spanAttributes: [
      {
        otlp: OTLP.traces.rpc.METHOD,
        instana: 'call',
        transform: (value, spanData) => getRPCMethod(value, spanData)
      },
      {
        otlp: OTLP.traces.rpc.METHOD_ORIGINAL,
        instana: 'call',
        transform: (value, spanData) => getRPCMethodOriginal(value, spanData)
      },
      { otlp: OTLP.traces.rpc.SYSTEM_NAME, instana: 'flavor' },
      { otlp: OTLP.traces.server.ADDRESS, instana: 'host' },
      { otlp: OTLP.traces.server.PORT, instana: 'port' },
      { otlp: OTLP.traces.rpc.GRPC_ERROR, instana: 'error' }
    ]
  },

  // Note: span attributes follow the OTel GraphQL semantic conventions:
  // https://opentelemetry.io/docs/specs/semconv/graphql/graphql-spans/
  [INSTRUMENTATION_TYPES.GRAPHQL]: {
    spanName: data => data.operationType,
    spanAttributes: [
      { otlp: OTLP.traces.graphql.OPERATION_TYPE, instana: 'operationType' },
      { otlp: OTLP.traces.graphql.OPERATION_NAME, instana: 'operationName' },
      { otlp: OTLP.error.TYPE, instana: 'errors' }
    ]
  },

  // Note: Google Cloud Storage (GCS) is not included in the official OpenTelemetry semantic conventions
  // specification. This mapping uses standard cloud.* and database.* attributes to represent GCS operations.
  [INSTRUMENTATION_TYPES.GCS]: {
    spanName: data => `gcs.${data.op}`,
    spanAttributes: [
      { otlp: OTLP.traces.cloud.PROVIDER, value: 'gcp' },
      { otlp: OTLP.traces.database.OPERATION_NAME, instana: 'op' },
      { otlp: OTLP.traces.cloud.gcp.PROJECT_ID, instana: 'projectId' },
      { otlp: OTLP.traces.database.NAMESPACE, instana: 'bucket' },
      { otlp: OTLP.traces.database.COLLECTION_NAME, instana: 'object' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.S3]: {
    spanName: data => `S3.${data.op}`,
    spanAttributes: [
      { otlp: OTLP.traces.rpc.SYSTEM_NAME, value: 'aws-api' },
      { otlp: OTLP.traces.rpc.METHOD, instana: 'op' },
      { otlp: OTLP.traces.cloud.REGION, instana: 'region' },
      { otlp: OTLP.traces.cloud.PROVIDER, value: 'aws' },
      { otlp: OTLP.traces.cloud.aws.S3_BUCKET, instana: 'bucket' },
      { otlp: OTLP.traces.cloud.aws.S3_KEY, instana: 'key' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.KINESIS]: {
    spanName: data => `Kinesis.${data.op}`,
    spanAttributes: [
      { otlp: OTLP.traces.messaging.SYSTEM, value: 'aws_kinesis' },
      { otlp: OTLP.traces.messaging.OPERATION_NAME, instana: 'op' },
      { otlp: OTLP.traces.cloud.aws.KINESIS_STREAM, instana: 'stream' },
      { otlp: OTLP.traces.messaging.DESTINATION_NAME, instana: 'stream' },
      { otlp: OTLP.traces.messaging.DESTINATION_PARTITION_ID, instana: 'shard' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  // Note: Azure Storage is not included in the official OpenTelemetry semantic conventions
  // specification. This mapping uses standard cloud.* and database.* attributes to represent azure operations.
  [INSTRUMENTATION_TYPES.AZSTORAGE]: {
    spanName: data => `azure.storage.${data.op}`,
    spanAttributes: [
      { otlp: OTLP.traces.cloud.PROVIDER, value: 'azure' },
      { otlp: OTLP.traces.database.OPERATION_NAME, instana: 'op' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  // TBD: maybe not required as we already hanlde lambda entry
  [INSTRUMENTATION_TYPES.AWS_LAMBDA_INVOKE]: {
    spanName: data => data.function,
    spanAttributes: [
      { otlp: OTLP.traces.faas.NAME, instana: 'function' },
      { otlp: OTLP.traces.faas.INVOCATION_TYPE, instana: 'type' },
      { otlp: OTLP.traces.cloud.PROVIDER, value: 'aws' },
      { otlp: OTLP.traces.cloud.PLATFORM, value: 'aws_lambda' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.AWS_LAMBDA_ENTRY]: {
    spanName: data => data.functionName,
    spanAttributes: [
      {
        otlp: OTLP.traces.faas.TRIGGER,
        instana: 'trigger',
        transform: trigger => LAMBDA_TRIGGER_MAP[trigger] || 'other'
      },
      { otlp: OTLP.traces.faas.NAME, instana: 'functionName' },
      { otlp: OTLP.traces.faas.VERSION, instana: 'functionVersion' },
      { otlp: OTLP.traces.cloud.PROVIDER, value: 'aws' },
      { otlp: OTLP.traces.cloud.PLATFORM, value: 'aws_lambda' },
      {
        otlp: OTLP.traces.cloud.REGION,
        instana: 'arn',
        transform: arn => getRegionFromArn(arn)
      },
      {
        otlp: OTLP.traces.cloud.ACCOUNT_ID,
        instana: 'arn',
        transform: arn => getAccountIdFromArn(arn)
      },
      { otlp: OTLP.traces.cloud.RESOURCE_ID, instana: 'arn' },
      { otlp: OTLP.traces.faas.INVOCATION_ID, instana: 'reqId' },
      {
        otlp: OTLP.traces.faas.COLDSTART,
        instana: 'coldStart',
        transform: value => toBoolean(value)
      },
      { otlp: OTLP.traces.process.RUNTIME_NAME, instana: 'runtime' },
      { otlp: OTLP.exception.MESSAGE, instana: 'error' }
    ]
  },

  // PEER is special - only has attributes, no span name
  [INSTRUMENTATION_TYPES.PEER]: {
    spanAttributes: [
      { otlp: OTLP.traces.network.PEER_NAME, instana: 'hostname' },
      { otlp: OTLP.traces.network.PEER_PORT, instana: 'port' }
    ]
  },

  // SDK spans are created via the Instana SDK API by the user.
  // There are no official OTel semantic conventions for these spans.
  // Tags from sdk.custom.tags are expanded directly as flat attributes (no prefix).
  [INSTRUMENTATION_TYPES.SDK]: {
    spanName: data => data.name,
    spanAttributes: spanData => {
      const tags = spanData?.custom?.tags;
      if (!tags || typeof tags !== 'object') return [];
      return Object.keys(tags)
        .filter(k => tags[k] !== null && tags[k] !== undefined)
        .map(k => ({ key: k, value: formatOTLPValue(tags[k]) }));
    }
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

  const keys = Object.keys(span.data).filter(
    k => k !== INSTRUMENTATION_TYPES.PEER && k !== SPECIAL_SPAN_DATA_TYPES.RESOURCE
  );

  // CASE: ignore SDK data key if its multiple data keys, because
  //       we always prefer the other data key such as http
  if (keys.length > 1) {
    const nonSdk = keys.find(k => k !== INSTRUMENTATION_TYPES.SDK);
    if (nonSdk) return nonSdk;
  }

  return keys[0] || null;
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

      if (spanType === SPECIAL_SPAN_DATA_TYPES.RESOURCE) {
        continue;
      }

      const handler = instrumentationMappings[spanType]?.spanAttributes;
      const spanData = span.data[spanType];

      if (!handler || !spanData) {
        continue;
      }

      if (typeof handler === 'function') {
        const expanded = handler(spanData);
        for (let j = 0; j < expanded.length; j++) {
          attributes.push(expanded[j]);
        }
      } else {
        for (let j = 0; j < handler.length; j++) {
          const attribute = applyMapping(handler[j], spanData);
          if (attribute) {
            attributes.push(attribute);
          }
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
      return { code: OTLP_STATUS_CODES.UNSET };
    }

    return {
      code: OTLP_STATUS_CODES.ERROR,
      message: String(data?.error || `${type || span.n || 'operation'} failed`)
    };
  }
};
