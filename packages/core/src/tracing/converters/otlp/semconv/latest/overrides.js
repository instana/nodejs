/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// 1.41.0

const LOOKUP_OVERRIDES = {
  metadata: {
    PARENT_ID: 'parentSpanContext.spanId'
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
    kafka: {
      PARTITION: 'messaging.kafka.destination.partition'
    }
  },
  database: {
    SYSTEM: 'db.system.name',
    PEER_NAME: 'server.address',
    PEER_PORT: 'server.port'
  },
  network: {
    PEER_NAME: 'server.address',
    PEER_PORT: 'server.port'
  }
};

module.exports = { LOOKUP_OVERRIDES };
