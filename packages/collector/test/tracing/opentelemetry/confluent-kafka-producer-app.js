/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();
const express = require('express');
const bodyParser = require('body-parser');
const port = require('../../test_util/app-port')();
const logPrefix = `Confluent Kafka Producer App (${process.pid}):\t`;
const KafkaLib = require('@confluentinc/kafka-javascript');

const app = express();
app.use(bodyParser.json());

const broker = process.env.KAFKA_BROKER || process.env.KAFKA;
const topic = process.env.CONFLUENT_KAFKA_TOPIC;
// Umgebungsvariable zur Auswahl des Client-Typs
const clientType = (process.env.KAFKA_CLIENT_TYPE || 'kafkajs').toLowerCase();

let producer;
let connected = false;
let useRdKafka = false;

async function setupProducer() {
  if (!KafkaLib) return;

  let KafkaClient;

  if (clientType === 'rdkafka') {
    // Wenn 'rdkafka' gewählt ist, verwenden wir Producer (RdKafka)
    KafkaClient = KafkaLib.Producer || KafkaLib.RdKafka.Producer;
    useRdKafka = true;
    log(`Using ${clientType} (node-rdkafka) client.`);
  } else {
    // Standardmäßig oder bei 'kafkajs' verwenden wir KafkaJS.Kafka
    KafkaClient = KafkaLib.KafkaJS.Kafka || KafkaLib.Kafka;
    log(`Using ${clientType} (kafkajs) client.`);
  }

  if (!KafkaClient) {
    log(`Error: Kafka client for type ${clientType} not found in KafkaLib.`);
    return;
  }

  try {
    if (useRdKafka) {
      producer = new KafkaClient({
        'metadata.broker.list': broker
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
      // kafkajs Initialisierung
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
      // RdKafka verwendet producer.produce
      await producer.produce(
        topic,
        null, // Partition (null = zufällig)
        Buffer.from(message), // Nachricht als Buffer
        null, // Key
        Date.now() // Timestamp
      );

      log('RdKafka message produced.');

      // RdKafka benötigt flush(), um die Nachricht sofort zu senden
      await new Promise((resolve, reject) => {
        producer.flush(1000, err => {
          if (err) return reject(err);
          resolve();
        });
      });
    } else {
      // kafkajs verwendet producer.send
      await producer.send({ topic, messages: [{ value: message }] });
      log('KafkaJS message produced.');
    }

    // allow small time for delivery (nur für den Testfluss notwendig)
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
