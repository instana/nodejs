/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const LOOKUP_OVERRIDES = {
  http: {
    REQUEST_METHOD: 'http.request.method', // Upgraded to modern namespace
    RESPONSE_STATUS: 'http.response.status_code', // Upgraded to modern namespace
    URL_FULL: 'url.full', // Migrated to url.*
    URL_PATH: 'url.path' // Migrated to url.*
  },
  messaging: {
    DESTINATION_NAME: 'messaging.destination.name',
    kafka: {
      PARTITION: 'messaging.kafka.destination.partition'
    }
  },
  database: {
    PEER_NAME: 'server.address', // Migrated from net.peer.*
    PEER_PORT: 'server.port' // Migrated from net.peer.*
  },
  network: {
    PEER_NAME: 'server.address', // Migrated from net.peer.*
    PEER_PORT: 'server.port' // Migrated from net.peer.*
  }
};

module.exports = { LOOKUP_OVERRIDES };
