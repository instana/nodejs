/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

// we don't use Instana SDK for producer in the tests
require('../../../..')();
const express = require('express');
const bodyParser = require('body-parser');
const { Kafka } = require('kafkajs');

const appPort = process.env.APP_PORT || 3000;
const kafka = new Kafka({
  clientId: 'test-producer',
  brokers: [process.env.KAFKA],
  retry: {
    initialRetryTime: 500,
    retries: 0
  }
});
const producer = kafka.producer();

let connected = false;

const app = express();

(async function connect() {
  await producer.connect();
  connected = true;
})();

app.use(bodyParser.json());

(async function connect() {
  try {
    await producer.connect();
    connected = true;
    log('Kafka Producer connected.');
  } catch (error) {
    log('Failed to connect Kafka Producer:', error);
  }
})();

app.get('/', (_req, res) => {
  res.send(connected ? 'OK' : 'Service Unavailable');
});

app.post('/send-messages', async (req, res) => {
  const { key = 'key', value = 'value' } = req.body;

  try {
    await producer.send({
      topic: 'test-topic-1',
      messages: [{ key, value }]
    });

    res.sendStatus(200);
  } catch (error) {
    log('Failed to send message:', error);
    res.status(500).send('Failed to send message');
  }
});

app.listen(appPort, () => {
  log(`Producer listening on port: ${appPort}`);
});
function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Kafka Producer (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args); // eslint-disable-line
}
