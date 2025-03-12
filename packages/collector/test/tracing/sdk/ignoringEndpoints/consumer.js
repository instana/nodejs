/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('../../../..')();

const express = require('express');
const { Kafka } = require('kafkajs');
const { v4: uuid } = require('uuid');

const delay = require('../../../../../core/test/test_util/delay');

const appPort = process.env.APP_PORT;
const agentPort = process.env.INSTANA_AGENT_PORT;

const kafka = new Kafka({
  clientId: 'test-producer',
  brokers: [process.env.KAFKA],
  retry: {
    initialRetryTime: 500,
    retries: 5
  }
});
const messageConsumer = kafka.consumer({
  groupId: uuid()
});

let connected = false;
const app = express();
let currentSpan;

(async function connect() {
  await messageConsumer.connect();
  await messageConsumer.subscribe({ topic: 'test-topic-1', fromBeginning: false });
  await messageConsumer.subscribe({ topic: 'test-topic-2', fromBeginning: false });

  await messageConsumer.run({
    eachMessage: async ({ topic, message }) => {
      // Accessing the current span
      // This retrieves the current active span in the execution context.
      // If a span is ignored, it will return an `InstanaIgnoredSpan`.
      // Otherwise, it returns the actual trace span.
      currentSpan = instana.currentSpan();
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
        await delay(100);
        await fetch(`http://127.0.0.1:${agentPort}`);
        currentSpan.end();
      } catch (error) {
        log(error);
        currentSpan.end(1);
      }
    }
  });
  connected = true;
})();
app.get('/current-span', (req, res) => {
  if (currentSpan) {
    res.json({
      spanConstructorName: currentSpan.span?.constructor.name,
      span: currentSpan.span
    });
  } else {
    res.status(404).send('No span recorded yet');
  }
});
app.get('/', (req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.sendStatus(503);
  }
});

app.listen(appPort, () => {
  log(`Consumer listening on port: ${appPort}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Kafka Consumer (${process.pid}):\t${args[0]}`;
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
