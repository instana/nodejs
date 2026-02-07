/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

/* eslint-disable */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const port = require('@_local/collector/test/test_util/app-port')();
const agentPort = process.env.INSTANA_AGENT_PORT;

const instana = require('@instana/collector')();
const express = require('express');
const kafka = require('kafka-node');

const { v4: uuid } = require('uuid');

let connected = false;

const app = express();

const receivedMessages = [];
const receivedErrors = [];

let client;
if (kafka.Client) {
  // kafka-node < 4.0.0, client connects via zookeeper
  client = new kafka.Client(`${process.env.ZOOKEEPER}/`);
  client.on('error', error => {
    receivedErrors.push(error);
    log('Got a client error: %s', error);
  });
} else {
  // kafka-node >= 4.0.0, they dropped Zookeeper support, client connects directly to kafka
  client = new kafka.KafkaClient({ kafkaHost: process.env.KAFKA });
  client.on('error', error => {
    receivedErrors.push(error);
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

setTimeout(() => {
  // Apparently the kafka-node API has no way of getting notified when the consumer has successfully connected to the
  // broker, so we just assume it should have happened after 1500 ms.
  connected = true;
  log('Consumer is now ready.');
}, 1500);

consumer.on('error', err => {
  log('Error occured in consumer:', err);
  const span = instana.currentSpan();
  span.disableAutoEnd();
  receivedErrors.push(err);

  // simulating asynchronous follow up steps with setTimeout
  setTimeout(() => {
    fetch(`http://127.0.0.1:${agentPort}/ping`).finally(() => {
      span.end(1);
    });
  }, 100);
});

consumer.on('message', ({ topic, key, value }) => {
  log('Received a message');

  const span = instana.currentSpan();
  span.disableAutoEnd();
  receivedMessages.push({ topic, key, value });

  // simulating asynchronous follow up steps with setTimeout
  setTimeout(() => {
    fetch(`http://127.0.0.1:${agentPort}/ping`).finally(() => {
      span.end();
    });
  }, 100);
});

app.get('/', (req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.sendStatus(503);
  }
});

app.get('/messages', (req, res) => {
  res.send(receivedMessages);
});

app.get('/errors', (req, res) => {
  res.send(receivedErrors);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Kafka Consumer (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
