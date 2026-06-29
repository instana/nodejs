/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// v1.41 semantic conventions - overrides to base
const MAPPINGS = {
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
  database: {
    NAMESPACE: 'db.namespace',
    OPERATION: 'db.operation.name',
    PEER_NAME: 'server.address',
    PEER_PORT: 'server.port',
    QUERY_TEXT: 'db.query.text',
    SYSTEM: 'db.system.name'
  },
  network: {
    PEER_NAME: 'server.address',
    PEER_PORT: 'server.port'
  }
};

module.exports = { MAPPINGS };
