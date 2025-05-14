/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpressV4');

const instana = require('../../../..')();
const express = require('express');
const { Kafka } = require('kafkajs');
const fetch = require('node-fetch-v2');
const { v4: uuid } = require('uuid');

const delay = require('../../../../../core/test/test_util/delay');

const appPort = process.env.APP_PORT;
const agentPort = process.env.INSTANA_AGENT_PORT;
const runAsStandAlone = !!process.env.RUN_AS_STAND_ALONE;

const kafka = new Kafka({
  clientId: 'test-producer',
  brokers: [process.env.KAFKA],
  retry: {
    initialRetryTime: 500,
    retries: 5
  }
});

const messageConsumer = kafka.consumer({
  // Joining an existing consumer group sometimes takes a long time in Kafka, see for example
  // https://github.com/tulios/kafkajs/issues/260. Thus we always create a new consumer group ID on the fly.
  groupId: uuid()
});
const batchConsumer = kafka.consumer({ groupId: uuid() });

let connected = false;

const app = express();
const currentSpans = [];
let receivedMessages = [];

(async function connect() {
  await messageConsumer.connect();
  await messageConsumer.subscribe({ topic: 'test-topic-1', fromBeginning: false });
  await messageConsumer.subscribe({ topic: 'test-topic-2', fromBeginning: false });

  await messageConsumer.run({
    eachMessage: async ({ topic, message }) => {
      const span = instana.currentSpan();
      currentSpans.push(span);
      span.disableAutoEnd();

      log(
        'incoming message',
        topic,
        message,
        message.key && message.key.toString(),
        message.value && message.value.toString()
      );

      try {
        if (message.value.toString() === 'Boom!') {
          throw new Error('Boom!');
        }

        const headers = {};
        Object.keys(message.headers).forEach(headerName => {
          headers[headerName] = String(message.headers[headerName]);
        });

        receivedMessages.push({
          topic,
          key: message.key.toString(),
          value: message.value.toString(),
          headers
        });

        // simulating asynchronous follow up steps
        await delay(100);
        if (!runAsStandAlone) {
          await fetch(`http://127.0.0.1:${agentPort}`);
        }
        span.end();
        if (runAsStandAlone) {
          log('message has been processed');
        }
      } catch (error) {
        if (runAsStandAlone) {
          // eslint-disable-next-line no-console
          console.error(error);
        }
        span.end(1);
      }
    }
  });

  await batchConsumer.connect();
  await batchConsumer.subscribe({ topic: 'test-batch-topic-1', fromBeginning: false });
  await batchConsumer.subscribe({ topic: 'test-batch-topic-2', fromBeginning: false });

  await batchConsumer.run({
    eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
      const span = instana.currentSpan();
      currentSpans.push(span);
      span.disableAutoEnd();

      log('incoming batch', batch.topic, batch.messages.length);

      try {
        for (let i = 0; i < batch.messages.length; i++) {
          const message = batch.messages[i];

          log(
            'batch message',
            batch.topic,
            message.key && message.key.toString(),
            message.value && message.value.toString(),
            message.headers
          );

          if (message.value.toString() === 'Boom!') {
            throw new Error('Boom!');
          }

          const headers = {};
          Object.keys(message.headers).forEach(headerName => {
            headers[headerName] = String(message.headers[headerName]);
          });

          receivedMessages.push({
            topic: batch.topic,
            key: message.key.toString(),
            value: message.value.toString(),
            headers
          });

          resolveOffset(message.offset);
        }

        await heartbeat();

        // simulating asynchronous follow up steps
        await delay(100);
        if (!runAsStandAlone) {
          await fetch(`http://127.0.0.1:${agentPort}`);
        }
        span.end();
        if (runAsStandAlone) {
          log('batch has been processed');
        }
      } catch (error) {
        if (runAsStandAlone) {
          // eslint-disable-next-line no-console
          console.error(error);
        }
        span.end(1);
      }
    }
  });

  connected = true;
})();

app.get('/', (req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.sendStatus(503);
  }
});

app.get('/health', (req, res) => {
  res.send('OK');
});

app.get('/messages', (req, res) => {
  res.send(receivedMessages);
});

app.delete('/messages', (req, res) => {
  receivedMessages = [];
  res.sendStatus(209);
});

app.get('/current-span', (req, res) => {
  if (currentSpans.length) {
    const spans = currentSpans.map(currentSpan => ({
      spanConstructorName: currentSpan.span?.constructor?.name,
      span: currentSpan.span
    }));

    res.json(spans);
  } else {
    res.status(503).send('No span recorded yet');
  }
});

app.listen(appPort, () => {
  log(`Listening on port: ${appPort}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Kafka Consumer (${process.pid}):\t${args[0]}`;
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
