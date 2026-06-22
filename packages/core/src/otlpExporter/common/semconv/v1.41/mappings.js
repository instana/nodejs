/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// v1.43 semantic conventions - overrides to base
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
    kafka: {
      PARTITION: 'messaging.kafka.destination.partition'
    },
    sqs: {
      SYSTEM: 'aws_sqs'
    },
    gcp: {
      SYSTEM: 'gcp_pubsub'
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

module.exports = { MAPPINGS };
