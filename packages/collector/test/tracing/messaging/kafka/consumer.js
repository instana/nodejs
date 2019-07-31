/* eslint-disable */

'use strict';

const agentPort = process.env.AGENT_PORT;

const instana = require('../../../../')({
  agentPort,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

const request = require('request-promise');
const kafka = require('kafka-node');
const uuid = require('uuid/v4');

let client;
if (kafka.Client) {
  // kafka-node < 4.0.0, client connects via zookeeper
  client = new kafka.Client(`${process.env.ZOOKEEPER}/`);
  client.on('error', error => {
    log('Got a client error: %s', error);
  });
} else {
  // kafka-node >= 4.0.0, they dropped Zookeeper support, client connects directly to kafka
  client = new kafka.KafkaClient({ kafkaHost: '127.0.0.1:9092' });
  client.on('error', error => {
    log('Got a client error: %s', error);
  });
}

let consumer;
if (process.env.CONSUMER_TYPE === 'consumerGroup') {
  log('Using ConsumerGroup');
  consumer = new kafka.ConsumerGroup(
    {
      host: process.env.ZOOKEEPER,
      fromOffset: 'latest',
      groupId: uuid()
    },
    ['test']
  );
  // REMARK: kafka.HighLevelConsumer has been removed in kafka-node@4.0.0. We keep this code here in case
  // kafka-node < 4.0.0 needs to be tested.
  // } else if (process.env.CONSUMER_TYPE === 'highLevel') {
  //   log('Using HighLevelConsumer');
  //   consumer = new kafka.HighLevelConsumer(
  //     client,
  //     [
  //       {
  //         topic: 'test'
  //       }
  //     ],
  //     {
  //       fromOffset: false,
  //       groupId: uuid()
  //     }
  //   );
} else {
  log('Using Consumer');
  consumer = new kafka.Consumer(
    client,
    [
      {
        topic: 'test'
      }
    ],
    {
      fromOffset: false,
      groupId: uuid()
    }
  );
}

consumer.on('error', err => {
  log('Error occured in consumer:', err);
  const span = instana.currentSpan();
  span.disableAutoEnd();
  // simulating asynchronous follow up steps with setTimeout and request-promise
  setTimeout(() => {
    request(`http://127.0.0.1:${agentPort}`).finally(() => {
      span.end(1);
    });
  }, 100);
});

consumer.on('message', function() {
  const span = instana.currentSpan();
  span.disableAutoEnd();
  // simulating asynchronous follow up steps with setTimeout and request-promise
  setTimeout(() => {
    request(`http://127.0.0.1:${agentPort}`).finally(() => {
      span.end();
    });
  }, 100);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Kafka Consumer (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
