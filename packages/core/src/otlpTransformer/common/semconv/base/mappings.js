/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// Base mappings shared across semantic convention versions.
// Version-specific attribute names belong in their respective version directories.
const MAPPINGS = {
  resource: {
    SERVICE_NAME: 'service.name',
    SDK_LANGUAGE: 'telemetry.sdk.language',
    SDK_NAME: 'telemetry.sdk.name',
    SDK_VERSION: 'telemetry.sdk.version',
    HOST_NAME: 'host.name',
    HOST_ID: 'host.id',
    PROCESS_PID: 'process.pid',
    OS_TYPE: 'os.type',
    FAAS_NAME: 'faas.name'
  },

  common: {
    TRACE_ID: 'traceId',
    SPAN_ID: 'spanId',
    PARENT_ID: 'parentSpanId',
    RESOURCE: 'resource',
    INSTRUMENTATION_SCOPE: 'instrumentationScope',
    START_TIME_UNIX_NANO: 'startTimeUnixNano',
    END_TIME_UNIX_NANO: 'endTimeUnixNano'
  },

  traces: {
    span: {
      KIND: 'kind',
      NAME: 'name',
      STATUS: 'status',
      EVENTS: 'events',
      LINKS: 'links'
    },

    http: {
      ROUTE: 'http.route',
      STATUS_TEXT: 'http.status_text',
      URL_TEMPLATE: 'http.url.template',
      REQUEST_HEADER: 'http.request.header',
      RESPONSE_HEADER: 'http.response.header'
    },

    messaging: {
      SYSTEM: 'messaging.system',
      BATCH_MESSAGE_COUNT: 'messaging.batch.message_count',
      MESSAGE_ID: 'messaging.message.id',
      MESSAGE_BODY_SIZE: 'messaging.message.body.size',
      DESTINATION_PARTITION_ID: 'messaging.destination.partition.id',

      kafka: {
        MESSAGE_KEY: 'messaging.kafka.message.key'
      },

      rabbitmq: {
        ROUTING_KEY: 'messaging.rabbitmq.destination.routing_key'
      }
    },

    database: {
      COLLECTION_NAME: 'db.collection.name',

      dynamodb: {
        COLLECTION_NAME: 'aws.dynamodb.table_names'
      },

      mongodb: {
        COLLECTION: 'db.mongodb.collection'
      }
    },

    rpc: {
      METHOD: 'rpc.method',
      METHOD_ORIGINAL: 'rpc.method_original',
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
      PLATFORM: 'cloud.platform',
      ACCOUNT_ID: 'cloud.account.id',
      RESOURCE_ID: 'cloud.resource_id',

      gcp: {
        PROJECT_ID: 'gcp.project_id'
      },

      aws: {
        S3_BUCKET: 'aws.s3.bucket',
        S3_KEY: 'aws.s3.key'
      }
    },

    faas: {
      NAME: 'faas.name',
      VERSION: 'faas.version',
      INVOCATION_ID: 'faas.invocation_id',
      INVOCATION_TYPE: 'faas.invocation_type',
      TRIGGER: 'faas.trigger',
      COLDSTART: 'faas.coldstart'
    },

    network: {
      PEER_NAME: 'net.peer.name',
      PEER_PORT: 'net.peer.port'
    },

    process: {
      RUNTIME_NAME: 'process.runtime.name'
    },

    server: {
      ADDRESS: 'server.address',
      PORT: 'server.port'
    },

    exception: {
      MESSAGE: 'exception.message',
      STACKTRACE: 'exception.stacktrace',
      TYPE: 'exception.type'
    },

    error: {
      TYPE: 'error.type'
    }
  },

  logs: {
    record: {
      TIME_UNIX_NANO: 'timeUnixNano',
      OBSERVED_TIME_UNIX_NANO: 'observedTimeUnixNano',
      SEVERITY_NUMBER: 'severityNumber',
      SEVERITY_TEXT: 'severityText',
      BODY: 'body',
      ATTRIBUTES: 'attributes'
    }
  },

  metrics: {
    v8js: {
      GC_DURATION: 'v8js.gc.duration',
      HEAP_SPACE_AVAILABLE_SIZE: 'v8js.memory.heap.space.available_size',
      HEAP_SPACE_PHYSICAL_SIZE: 'v8js.memory.heap.space.physical_size',
      HEAP_SPACE_SIZE: 'v8js.memory.heap.space.size',
      HEAP_USED: 'v8js.memory.heap.used',
      RESOURCE_ACTIVE: 'v8js.resource.active',

      attributes: {
        GC_TYPE: 'v8js.gc.type',
        HEAP_SPACE_NAME: 'v8js.heap.space.name',
        RESOURCE_TYPE: 'v8js.resource.type'
      }
    },
    nodejs: {
      EVENTLOOP_DELAY_MIN: 'nodejs.eventloop.delay.min',
      EVENTLOOP_DELAY_MAX: 'nodejs.eventloop.delay.max',
      EVENTLOOP_DELAY_MEAN: 'nodejs.eventloop.delay.mean'
    }
  }
};

module.exports = { MAPPINGS };
