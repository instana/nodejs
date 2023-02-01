/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const instana = require('../../../..')();

// eslint-disable-next-line import/no-extraneous-dependencies
const KafkaAvro = require('kafka-avro');

const fetch = require('node-fetch');
const delay = require('../../../../../core/test/test_util/delay');
const agentPort = process.env.INSTANA_AGENT_PORT || 42699;
const { sendToParent } = require('@instana/core/test/test_util');
const logPrefix = `Kafka Avro Consumer (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const express = require('express');
const port = require('../../../test_util/app-port')();

const kafkaAvro = new KafkaAvro({
  kafkaBroker: 'localhost:9092',
  schemaRegistry: 'http://localhost:8081'
});

let isReady = false;

const topicName = 'kafka-avro-topic';

(async () => {
  await kafkaAvro.init();

  const consumer = await kafkaAvro.getConsumer({
    // Keep this value low (default is 5000ms) to be sure that messages won't survive between tests.
    'auto.commit.interval.ms': 500,
    'group.id': 'librd-test',
    'socket.keepalive.enable': true,
    'enable.auto.commit': true
  });

  await new Promise((resolve, reject) => {
    consumer.on('ready', () => {
      isReady = true;
      resolve(consumer);
    });

    consumer.connect({}, err => {
      if (err) {
        reject(err);
        return;
      }
      resolve(consumer); // depend on Promises' single resolve contract.
    });
  });

  // Subscribe and consume.
  consumer.subscribe([topicName]);

  consumer.on('data', async rawData => {
    const span = instana.currentSpan();
    span.disableAutoEnd();
    sendToParent(rawData.value);
    log('Got message');

    await delay(200);
    await fetch(`http://127.0.0.1:${agentPort}`);
    span.end();
  });

  consumer.consume();
})();

const app = express();

app.get('/', (_req, res) => {
  if (isReady) {
    res.send('ok');
  } else {
    res.status(500).send('Kafka Avro Consumer is not ready yet.');
  }
});

app.listen(port, () => log(`Kafka Avro Consumer app listening on port ${port}`));
