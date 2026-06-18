/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// v1.23 semantic conventions - specific attribute names for v1.23
const MAPPINGS = {
  http: {
    REQUEST_METHOD: 'http.method',
    RESPONSE_STATUS: 'http.status_code',
    URL_FULL: 'http.url',
    URL_PATH: 'http.target',
    URL_QUERY: 'http.url.query'
  },

  messaging: {
    DESTINATION_NAME: 'messaging.destination',
    kafka: {
      PARTITION: 'messaging.kafka.partition'
    }
  },

  database: {
    SYSTEM: 'db.system',
    PEER_NAME: 'net.peer.name',
    PEER_PORT: 'net.peer.port'
  },

  network: {
    PEER_NAME: 'net.peer.name',
    PEER_PORT: 'net.peer.port'
  }
};

module.exports = { MAPPINGS };
