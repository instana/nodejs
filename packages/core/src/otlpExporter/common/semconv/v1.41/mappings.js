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
    OPERATION_NAME: 'db.operation.name',
    PEER_NAME: 'server.address',
    PEER_PORT: 'server.port',
    QUERY_TEXT: 'db.query.text',
    SYSTEM_NAME: 'db.system.name',
    mongodb: {
      COLLECTION: 'db.collection.name'
    }
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
    OPERATION_NAME: 'messaging.operation.name',
    kafka: {
      PARTITION: 'messaging.kafka.destination.partition',
      CONSUMER_GROUP: 'messaging.consumer.group.name',
      OFFSET: 'messaging.kafka.offset'
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
