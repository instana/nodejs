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
  getRPCMethodOriginal
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
 * @property {AttributeMapping[]} [spanAttributes]
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
      { otlp: OTLP.http.REQUEST_METHOD, instana: 'operation', transform: toUpperCase },
      { otlp: OTLP.http.URL_FULL, instana: 'endpoints' },
      { otlp: OTLP.http.URL_PATH, instana: 'path' },
      { otlp: OTLP.http.URL_QUERY, instana: 'params' },
      { otlp: OTLP.http.RESPONSE_STATUS, instana: 'status' },
      // TODO: Instana stores both request and response headers in the same `header` field.
      // We need an internal mechanism to distinguish between request and response headers.
      { otlp: OTLP.http.REQUEST_HEADER, instana: 'header' },
      { otlp: OTLP.http.URL_TEMPLATE, instana: 'path_tpl' },
      { otlp: OTLP.http.ROUTE, instana: 'route' },
      { otlp: OTLP.server.ADDRESS, instana: 'connection', transform: extractHost },
      { otlp: OTLP.server.PORT, instana: 'connection', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.KAFKA]: {
    spanName: data => `${data.operation} ${data.endpoints}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: INSTRUMENTATION_TYPES.KAFKA },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'endpoints' },
      { otlp: OTLP.messaging.OPERATION, instana: 'operation' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'operation' },
      {
        otlp: OTLP.messaging.OPERATION_TYPE,
        instana: 'operation'
      },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.RABBITMQ]: {
    spanName: data => `${data.sort} ${data.exchange}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: INSTRUMENTATION_TYPES.RABBITMQ },
      { otlp: OTLP.messaging.OPERATION, instana: 'sort' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'sort' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: ['exchange', 'key'] },
      { otlp: OTLP.messaging.rabbitmq.ROUTING_KEY, instana: 'key' },
      { otlp: OTLP.messaging.MESSAGE_BODY_SIZE, instana: 'size' },
      { otlp: OTLP.server.ADDRESS, instana: 'address', transform: extractHost },
      { otlp: OTLP.server.PORT, instana: 'address', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.NATS]: {
    spanName: data => `${data.sort} ${data.subject}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: INSTRUMENTATION_TYPES.NATS },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'subject' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'sort' },
      { otlp: OTLP.server.ADDRESS, instana: 'address', transform: extractHost },
      { otlp: OTLP.server.PORT, instana: 'address', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.BULL]: {
    spanName: data => `${data.sort} ${data.queue}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: INSTRUMENTATION_TYPES.BULL },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'sort' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'queue' },
      { otlp: OTLP.messaging.MESSAGE_ID, instana: 'messageId' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.SQS]: {
    spanName: data => `${data.sort} ${data.queue}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: 'aws_sqs' },
      { otlp: OTLP.faas.TRIGGER, value: 'pubsub' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'type' },
      { otlp: OTLP.messaging.OPERATION_TYPE, value: 'process' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'queue' },
      { otlp: OTLP.messaging.BATCH_MESSAGE_COUNT, instana: 'size' },
      { otlp: OTLP.messaging.MESSAGE_ID, instana: 'messageId' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.SNS]: {
    spanName: data => `publish ${data.topic}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: 'aws.sns' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'topic' },
      // We don't have the actual operation name. Using "send" based on the RFD.
      { otlp: OTLP.messaging.OPERATION_NAME, value: 'send' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.GCPS]: {
    spanName: data => `${data.op}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: 'gcp_pubsub' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'op' },
      {
        otlp: OTLP.messaging.DESTINATION_NAME,
        instana: ['top', 'sub'],
        transform: firstDefined
      },
      { otlp: OTLP.cloud.gcp.PROJECT_ID, instana: 'projid' },
      { otlp: OTLP.messaging.MESSAGE_ID, instana: 'messageId' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.PG]: {
    spanName: data => data.stmt,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'postgresql' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.database.STATEMENT, instana: 'stmt' },
      { otlp: OTLP.database.USER, instana: 'user' },
      { otlp: OTLP.database.NAME, instana: 'db' },
      { otlp: OTLP.server.ADDRESS, instana: 'host' },
      { otlp: OTLP.server.PORT, instana: 'port' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MYSQL]: {
    spanName: data => data.stmt,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'mysql' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.database.STATEMENT, instana: 'stmt' },
      { otlp: OTLP.database.USER, instana: 'user' },
      { otlp: OTLP.database.NAME, instana: 'db' },
      { otlp: OTLP.server.ADDRESS, instana: 'host' },
      { otlp: OTLP.server.PORT, instana: 'port' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MSSQL]: {
    spanName: data => data.stmt,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'mssql' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.database.STATEMENT, instana: 'stmt' },
      { otlp: OTLP.database.USER, instana: 'user' },
      { otlp: OTLP.database.NAME, instana: 'db' },
      { otlp: OTLP.server.ADDRESS, instana: 'host' },
      { otlp: OTLP.server.PORT, instana: 'port' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.DB2]: {
    spanName: data => data.stmt,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: INSTRUMENTATION_TYPES.DB2 },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'stmt' },
      { otlp: OTLP.database.STATEMENT, instana: 'stmt' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MONGO]: {
    spanName: data => data.command,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'mongodb' },
      { otlp: OTLP.database.NAMESPACE, instana: 'namespace' },
      { otlp: OTLP.database.mongodb.COLLECTION_NAME, instana: 'collection' },
      { otlp: OTLP.database.COLLECTION_NAME, instana: 'collection' },
      { otlp: OTLP.database.OPERATION, instana: 'command', transform: toUpperCase },
      { otlp: OTLP.database.QUERY_TEXT, instana: ['json', 'filter'], transform: firstDefined },
      { otlp: OTLP.database.STATEMENT, instana: ['json', 'filter'], transform: firstDefined },
      { otlp: OTLP.server.ADDRESS, instana: 'service', transform: extractHost },
      { otlp: OTLP.server.PORT, instana: 'service', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.REDIS]: {
    spanName: data => data.operation,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: INSTRUMENTATION_TYPES.REDIS },
      { otlp: OTLP.database.OPERATION, instana: 'operation' },
      { otlp: OTLP.database.CONNECTION_STRING, instana: 'connection' },
      { otlp: OTLP.server.ADDRESS, instana: 'connection', transform: extractHost },
      { otlp: OTLP.server.PORT, instana: 'connection', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.COUCHBASE]: {
    spanName: data => data.bucket,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'couchdb' },
      { otlp: OTLP.database.NAMESPACE, instana: 'bucket' },
      { otlp: OTLP.database.NAME, instana: 'bucket' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'sql' },
      { otlp: OTLP.database.STATEMENT, instana: 'sql' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.ELASTICSEARCH]: {
    spanName: data => data.action,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: INSTRUMENTATION_TYPES.ELASTICSEARCH },
      { otlp: OTLP.database.OPERATION, instana: 'action' },
      { otlp: OTLP.database.NAME, instana: 'cluster' },
      { otlp: OTLP.database.COLLECTION_NAME, instana: 'index' },
      { otlp: OTLP.database.QUERY_TEXT, instana: 'query' },
      { otlp: OTLP.database.STATEMENT, instana: 'query' },
      { otlp: OTLP.database.CONNECTION_STRING, instana: 'hostname' },
      { otlp: OTLP.server.ADDRESS, instana: 'hostname', transform: extractHost },
      { otlp: OTLP.server.PORT, instana: 'hostname', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.DYNAMODB]: {
    spanName: data => data.operation,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: INSTRUMENTATION_TYPES.DYNAMODB },
      { otlp: OTLP.database.OPERATION, instana: 'operation' },
      { otlp: OTLP.cloud.REGION, instana: 'region' },
      { otlp: OTLP.database.AWS_DYNAMODB_TABLE_NAMES, instana: 'table' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.MEMCACHED]: {
    spanName: data => data.operation,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, value: 'memcached' },
      { otlp: OTLP.database.CONNECTION_STRING, instana: 'connection' },
      { otlp: OTLP.database.OPERATION, instana: 'operation' },
      { otlp: OTLP.server.ADDRESS, instana: 'connection', transform: extractHost },
      { otlp: OTLP.server.PORT, instana: 'connection', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },
  // Note: There is no official OpenTelemetry semantic convention for Prisma, and it is not covered in our RFD either.
  // We can therefore adopt a generic database convention, using the Prisma provider as the database system identifier.
  [INSTRUMENTATION_TYPES.PRISMA]: {
    spanName: data => data.action,
    spanAttributes: [
      { otlp: OTLP.database.SYSTEM, instana: 'provider' },
      { otlp: OTLP.database.COLLECTION_NAME, instana: 'model' },
      { otlp: OTLP.database.OPERATION, instana: 'action' },
      { otlp: OTLP.database.CONNECTION_STRING, instana: 'url' },
      { otlp: OTLP.server.ADDRESS, instana: 'url', transform: extractHost },
      { otlp: OTLP.server.PORT, instana: 'url', transform: extractPort },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.RPC]: {
    spanName: data => data.call,
    spanAttributes: [
      {
        otlp: OTLP.rpc.METHOD,
        instana: 'call',
        transform: (value, spanData) => getRPCMethod(value, spanData)
      },
      {
        otlp: OTLP.rpc.METHOD_ORIGINAL,
        instana: 'call',
        transform: (value, spanData) => getRPCMethodOriginal(value, spanData)
      },
      { otlp: OTLP.rpc.SYSTEM_NAME, instana: 'flavor' },
      { otlp: OTLP.server.ADDRESS, instana: 'host' },
      { otlp: OTLP.server.PORT, instana: 'port' },
      { otlp: OTLP.rpc.GRPC_ERROR, instana: 'error' }
    ]
  },

  // Note: span attributes follow the OTel GraphQL semantic conventions:
  // https://opentelemetry.io/docs/specs/semconv/graphql/graphql-spans/
  [INSTRUMENTATION_TYPES.GRAPHQL]: {
    spanName: data => `${data.operationType}`,
    spanAttributes: [
      { otlp: OTLP.graphql.OPERATION_TYPE, instana: 'operationType' },
      { otlp: OTLP.graphql.OPERATION_NAME, instana: 'operationName' },
      { otlp: OTLP.error.TYPE, instana: 'errors' }
    ]
  },

  // Note: Google Cloud Storage (GCS) is not included in the official OpenTelemetry semantic conventions
  // specification. This mapping uses standard cloud.* and database.* attributes to represent GCS operations.
  [INSTRUMENTATION_TYPES.GCS]: {
    spanName: data => `gcs.${data.op}`,
    spanAttributes: [
      { otlp: OTLP.cloud.PROVIDER, value: 'gcp' },
      { otlp: OTLP.database.OPERATION, instana: 'op' },
      { otlp: OTLP.cloud.gcp.PROJECT_ID, instana: 'projectId' },
      { otlp: OTLP.database.NAMESPACE, instana: 'bucket' },
      { otlp: OTLP.database.COLLECTION_NAME, instana: 'object' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.S3]: {
    spanName: data => `s3.${data.op}`,
    spanAttributes: [
      { otlp: OTLP.rpc.SYSTEM_NAME, value: 'aws-api' },
      { otlp: OTLP.rpc.METHOD, instana: 'op', transform: value => (value ? `S3.${value}` : value) },
      { otlp: OTLP.cloud.REGION, instana: 'region' },
      { otlp: OTLP.cloud.PROVIDER, value: 'aws' },
      { otlp: OTLP.cloud.aws.S3_BUCKET, instana: 'bucket' },
      { otlp: OTLP.cloud.aws.S3_KEY, instana: 'key' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.KINESIS]: {
    spanName: data => `kinesis.${data.op}`,
    spanAttributes: [
      { otlp: OTLP.messaging.SYSTEM, value: 'aws_kinesis' },
      { otlp: OTLP.messaging.OPERATION_NAME, instana: 'op' },
      { otlp: OTLP.cloud.aws.KINESIS_STREAM, instana: 'stream' },
      { otlp: OTLP.messaging.DESTINATION_NAME, instana: 'stream' },
      { otlp: OTLP.messaging.DESTINATION_PARTITION_ID, instana: 'shard' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  // Note: Azure Storage is not included in the official OpenTelemetry semantic conventions
  // specification. This mapping uses standard cloud.* and database.* attributes to represent azure operations.
  [INSTRUMENTATION_TYPES.AZSTORAGE]: {
    spanName: data => `azure.storage.${data.op}`,
    spanAttributes: [
      { otlp: OTLP.cloud.PROVIDER, value: 'azure' },
      { otlp: OTLP.database.OPERATION, instana: 'op' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  // TBD: maybe not required as we already hanlde lambda entry
  [INSTRUMENTATION_TYPES.AWS_LAMBDA_INVOKE]: {
    spanName: data => data.function,
    spanAttributes: [
      { otlp: OTLP.faas.NAME, instana: 'function' },
      { otlp: OTLP.faas.INVOCATION_TYPE, instana: 'type' },
      { otlp: OTLP.cloud.PROVIDER, value: 'aws' },
      { otlp: OTLP.cloud.PLATFORM, value: 'aws_lambda' },
      { otlp: OTLP.error.TYPE, instana: 'error' }
    ]
  },

  [INSTRUMENTATION_TYPES.AWS_LAMBDA_ENTRY]: {
    spanName: data => data.functionName,
    spanAttributes: [
      {
        otlp: OTLP.faas.TRIGGER,
        instana: 'trigger',
        transform: trigger => LAMBDA_TRIGGER_MAP[trigger] || 'other'
      },
      { otlp: OTLP.faas.NAME, instana: 'functionName' },
      { otlp: OTLP.faas.VERSION, instana: 'functionVersion' },
      { otlp: OTLP.cloud.PROVIDER, value: 'aws' },
      { otlp: OTLP.cloud.PLATFORM, value: 'aws_lambda' },
      {
        otlp: OTLP.cloud.REGION,
        instana: 'arn',
        transform: arn => {
          // arn:aws:lambda:{region}:{account-id}:function:{name}:{version}
          const parts = typeof arn === 'string' ? arn.split(':') : [];
          return parts[3] || undefined;
        }
      },
      {
        otlp: OTLP.cloud.ACCOUNT_ID,
        instana: 'arn',
        transform: arn => {
          const parts = typeof arn === 'string' ? arn.split(':') : [];
          return parts[4] || undefined;
        }
      },
      { otlp: OTLP.cloud.RESOURCE_ID, instana: 'arn' },
      { otlp: OTLP.faas.INVOCATION_ID, instana: 'reqId' },
      {
        otlp: OTLP.faas.COLDSTART,
        instana: 'coldStart',
        transform: value => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') return value === 'true';
          return undefined;
        }
      },
      { otlp: OTLP.process.RUNTIME_NAME, instana: 'runtime' },
      { otlp: OTLP.exception.MESSAGE, instana: 'error' }
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

  const key = Object.keys(span.data).find(
    k => k !== INSTRUMENTATION_TYPES.PEER && k !== SPECIAL_SPAN_DATA_TYPES.RESOURCE
  );

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

      if (spanType === SPECIAL_SPAN_DATA_TYPES.RESOURCE) {
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
      return { code: OTLP_STATUS_CODES.UNSET };
    }

    return {
      code: OTLP_STATUS_CODES.ERROR,
      message: String(data?.error || `${type || span.n || 'operation'} failed`)
    };
  }
};
