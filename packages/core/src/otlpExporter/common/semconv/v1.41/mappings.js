/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// v1.41 semantic conventions - overrides to base
const MAPPINGS = {
  aws: {
    KINESIS_STREAM: 'aws.kinesis.stream_name'
  },
  database: {
    NAMESPACE: 'db.namespace',
    OPERATION: 'db.operation.name',
    PEER_NAME: 'server.address',
    PEER_PORT: 'server.port',
    QUERY_TEXT: 'db.query.text',
    SYSTEM: 'db.system.name'
  },
  http: {
    REQUEST_METHOD: 'http.request.method',
    RESPONSE_STATUS: 'http.response.status_code',
    URL_FULL: 'url.full',
    URL_PATH: 'url.path',
    URL_QUERY: 'url.query'
  },
  messaging: {
    DESTINATION_NAME: 'messaging.destination.name',
    OPERATION_TYPE: 'messaging.operation.type',
    OPERATION_NAME: 'messaging.operation.name',
    kafka: {
      PARTITION: 'messaging.kafka.destination.partition'
    }
  },
  network: {
    PEER_NAME: 'server.address',
    PEER_PORT: 'server.port'
  },
  rpc: {
    SYSTEM_NAME: 'rpc.system.name'
  }
};

module.exports = { MAPPINGS };
