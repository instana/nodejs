/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

require('../../../..')({});

// eslint-disable-next-line import/no-extraneous-dependencies
const KafkaAvro = require('kafka-avro');

const fetch = require('node-fetch');
const agentPort = process.env.INSTANA_AGENT_PORT || 42699;
const logPrefix = `Kafka Avro Producer (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
const express = require('express');
const port = process.env.APP_PORT || 3216;

const app = express();

const kafkaAvro = new KafkaAvro({
  kafkaBroker: 'localhost:9092',
  schemaRegistry: 'http://localhost:8081'
});

let isReady = false;
// Query the Schema Registry for all topic-schema's
// fetch them and evaluate them.
kafkaAvro.init().then(() => {
  isReady = true;
  log('Ready to use');
});

let messageCounter = 0;
const topicName = 'kafka-avro-topic';

app.get('/produce', async (req, res) => {
  ++messageCounter;
  const producer = await kafkaAvro.getProducer({});

  producer.on('disconnected', arg => {
    log(`producer disconnected. ${JSON.stringify(arg)}`);
  });

  const value = { name: 'John', messageCounter };
  const key = 'key';

  // if partition is set to -1, librdkafka will use the default partitioner
  const partition = -1;
  producer.produce(topicName, partition, value, key);
  log('Sent message');

  setTimeout(async () => {
    await fetch(`http://127.0.0.1:${agentPort}`);

    res.send({
      topicName,
      partition,
      key,
      value
    });
  }, 100);
});

app.get('/', (_req, res) => {
  if (isReady) {
    res.send('ok');
  } else {
    res.status(500).send('Kafka Avro Producer is not ready yet.');
  }
});

app.listen(port, () => {
  log(`Kafka Avro Producer app listening on port ${port}`);
});
