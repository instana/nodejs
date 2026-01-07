/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import express from 'express';
import bodyParser from 'body-parser';
import getAppPort from '../../test_util/app-port.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const port = getAppPort();
const logPrefix = `Confluent Kafka Producer App (${process.pid}):\t`;
import KafkaLib from '@confluentinc/kafka-javascript';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const confluentKafkaPath = require.resolve('@confluentinc/kafka-javascript');
const expectedLocalPath = path.resolve(__dirname, 'node_modules', '@confluentinc/kafka-javascript');
if (!confluentKafkaPath.includes(expectedLocalPath)) {
  throw new Error(
    `@confluentinc/kafka-javascript must be loaded from local node_modules. Expected path containing: ${expectedLocalPath}, but got: ${confluentKafkaPath}`
  );
}

const app = express();
app.use(bodyParser.json());

const broker = process.env.KAFKA;
const topic = process.env.CONFLUENT_KAFKA_TOPIC;
const clientType = (process.env.KAFKA_CLIENT_TYPE || 'kafkajs').toLowerCase();

let producer;
let connected = false;
let useRdKafka = false;

async function setupProducer() {
  if (!KafkaLib) return;

  let KafkaClient;

  // see https://github.com/confluentinc/confluent-kafka-javascript/blob/master/INTRODUCTION.md
  if (clientType === 'rdkafka') {
    // Callback API: new Producer({...})
    KafkaClient = KafkaLib.Producer || KafkaLib.RdKafka.Producer;
    useRdKafka = true;
  } else {
    // Promise API: new Kafka().producer({...})
    KafkaClient = KafkaLib.KafkaJS.Kafka || KafkaLib.Kafka;
  }

  if (!KafkaClient) {
    log(`Error: Kafka client for type ${clientType} not found in KafkaLib.`);
    return;
  }

  try {
    if (useRdKafka) {
      producer = new KafkaClient({
        'bootstrap.servers': broker,
        'client.id': 'rdkafka-test-producer'
      });

      producer.connect();

      producer.on('ready', () => {
        log('RdKafka Producer ready.');
        connected = true;
      });

      producer.on('event.error', err => {
        log('RdKafka Producer error:', err.message);
      });
    } else {
      // kafkajs Initialization
      const kafka = new KafkaClient({
        'bootstrap.servers': broker,
        kafkaJS: { clientId: 'confluent-producer', brokers: [broker] }
      });
      producer = kafka.producer();
      await producer.connect();
      log('KafkaJS Producer ready.');
      connected = true;
    }
  } catch (e) {
    log('Producer setup error', e && e.message);
  }
}

app.get('/', (_req, res) => {
  if (connected) res.send('OK');
  else res.sendStatus(503);
});

app.get('/produce', async (req, res) => {
  log('/produce');

  const message = `${Date.now()}-${process.pid}`;
  if (!producer) {
    return res.status(500).send({ error: 'producer not available' });
  }

  try {
    if (useRdKafka) {
      await producer.produce(topic, null, Buffer.from(message), null, Date.now());

      log('RdKafka message produced.');

      await new Promise((resolve, reject) => {
        producer.flush(1000, err => {
          if (err) return reject(err);
          resolve();
        });
      });
    } else {
      await producer.send({ topic, messages: [{ value: message }] });
      log('KafkaJS message produced.');
    }

    await new Promise(resolve => setTimeout(resolve, 200));
    res.send({ produced: true, message });
  } catch (e) {
    res.status(500).send({ error: e.message });
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
  setupProducer().catch(() => {});
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
