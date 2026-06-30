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
    OPERATION_NAME: 'messaging.operation',
    kafka: {
      PARTITION: 'messaging.kafka.partition'
    }
  },

  database: {
    CONNECTION_STRING: 'db.connection_string',
    MONGO_DB_COLLECTION: 'db.mongodb.collection',
    NAME: 'db.name',
    OPERATION: 'db.operation',
    PEER_NAME: 'net.peer.name',
    PEER_PORT: 'net.peer.port',
    STATEMENT: 'db.statement',
    SYSTEM: 'db.system'
  },

  network: {
    PEER_NAME: 'net.peer.name',
    PEER_PORT: 'net.peer.port'
  },

  rpc: {
    SYSTEM_NAME: 'rpc.system'
  }
};

module.exports = { MAPPINGS };
