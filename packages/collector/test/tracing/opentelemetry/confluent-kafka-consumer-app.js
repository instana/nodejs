/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('@instana/collector')();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch-v2');
const delay = require('../../../../core/test/test_util/delay');
const port = require('../../test_util/app-port')();
const logPrefix = `Confluent Kafka Consumer App (${process.pid}):\t`;
const KafkaLib = require('@confluentinc/kafka-javascript');

const app = express();
app.use(bodyParser.json());

const broker = process.env.KAFKA;
const topic = process.env.CONFLUENT_KAFKA_TOPIC;
const clientType = (process.env.KAFKA_CLIENT_TYPE || 'kafkajs').toLowerCase();

let consumer;
let connected = false;

async function setupConsumer() {
  if (!KafkaLib) return;

  let KafkaClient;
  let useRdKafka = false;

  if (clientType === 'rdkafka') {
    KafkaClient = KafkaLib.KafkaConsumer || KafkaLib.RdKafka.KafkaConsumer;
    useRdKafka = true;
    log(`Using ${clientType} (node-rdkafka) client.`);
  } else {
    KafkaClient = KafkaLib.KafkaJS.Kafka || KafkaLib.Kafka;
    log(`Using ${clientType} (kafkajs) client.`);
  }

  if (!KafkaClient) {
    log(`Error: Kafka client for type ${clientType} not found in KafkaLib.`);
    return;
  }

  try {
    if (useRdKafka) {
      consumer = new KafkaClient({
        'group.id': `confluent-consumer-${process.pid}`,
        'metadata.broker.list': broker
      });

      consumer.connect();

      consumer.on('ready', () => {
        log('RdKafka Consumer ready.');
        consumer.subscribe([topic]);
        consumer.consume();
        connected = true;
      });

      consumer.on('data', async msg => {
        const span = instana.currentSpan();
        span && span.disableAutoEnd && span.disableAutoEnd();

        const value = msg.value && msg.value.toString();
        log('Consumed (data) message', msg.topic, value);

        await delay(50);
        await fetch(`http://127.0.0.1:${process.env.INSTANA_AGENT_PORT}/ping`);
        span && span.end && span.end();
      });

      consumer.on('event.error', err => {
        log('RdKafka Consumer error:', err.message);
      });
    } else {
      const kafka = new KafkaClient({
        kafkaJS: {
          clientId: 'confluent-consumer',
          brokers: [broker],
          groupId: `confluent-consumer-${process.pid}`
        }
      });

      consumer = kafka.consumer();

      await consumer.connect();
      log('Consumer connected, subscribing to topic:', topic);
      await consumer.subscribe({ topic });
      log('Consumer subscribed to topic:', topic);

      log('Starting consumer.run()...');
      await consumer.run({
        eachMessage: async ({ topic: t, message }) => {
          log('eachMessage callback called for topic:', t);
          const span = instana.currentSpan();
          span && span.disableAutoEnd && span.disableAutoEnd();

          const value = message && message.value ? message.value.toString() : undefined;
          log('Consumed (kafkajs) message', t, value);

          await delay(50);
          await fetch(`http://127.0.0.1:${process.env.INSTANA_AGENT_PORT}/ping`);
          span && span.end && span.end();
        }
      });

      setTimeout(() => {
        log('KafkaJS Consumer ready.');
        connected = true;
      }, 2 * 1000);
    }
  } catch (e) {
    log('Consumer setup error', e && e.message);
  }
}

app.get('/', (_req, res) => {
  if (connected) res.send('OK');
  else res.sendStatus(503);
});

app.get('/messages', (_req, res) => {
  res.sendStatus(200);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
  setupConsumer().catch(() => {});
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
