/*
 * (c) Copyright IBM Corp. 2026
 */

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import { randomUUID } from 'crypto';
import express from 'express';
import bodyParser from 'body-parser';
import getAppPort from '@_local/collector/test/test_util/app-port.js';
import { Producer, stringSerializers } from '@platformatic/kafka';

const port = getAppPort();
const logPrefix = `[platformatic-kafka producer (${process.pid})]`;

function log(...args) {
  args[0] = `${logPrefix} ${args[0]}`;
  // eslint-disable-next-line no-console
  console.log(...args);
}

const app = express();
app.use(bodyParser.json());

const bootstrapBrokers = (process.env.INSTANA_CONNECT_KAFKA || 'localhost:9092').split(',');
const topic = process.env.PLATFORMATIC_KAFKA_TOPIC || 'platformatic-kafka-topic';

const producer = new Producer({
  clientId: `test-producer-${randomUUID()}`,
  bootstrapBrokers,
  serializers: stringSerializers
});

let connected = false;

async function connect() {
  try {
    await producer.metadata({ topics: [topic] });
    connected = true;
    log('Producer ready.');
  } catch (err) {
    log('Producer connection error:', err.message);
  }
}

app.get('/', (_req, res) => {
  if (connected) res.send('OK');
  else res.sendStatus(503);
});

app.get('/produce', async (_req, res) => {
  log('/produce');

  const message = `${Date.now()}-${process.pid}`;

  try {
    await producer.send({
      messages: [
        {
          topic,
          key: 'key',
          value: message
        }
      ]
    });
    log('Message produced.');

    await new Promise(resolve => setTimeout(resolve, 200));
    res.send({ produced: true, message });
  } catch (e) {
    log('Error producing message:', e && e.message);
    res.status(500).send({ error: e.message });
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
  connect().catch(err => log('Connect error:', err && err.message));
});
