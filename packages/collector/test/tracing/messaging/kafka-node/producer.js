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

const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../..')();

const fetch = require('node-fetch-v2');
const bodyParser = require('body-parser');
require('@instana/core/test/test_util/mockRequireExpress');
const express = require('express');
const kafka = require('kafka-node');
const port = require('../../../test_util/app-port')();
const app = express();

let client;
if (kafka.Client) {
  // kafka-node < 4.0.0, client connects via zookeeper
  client = new kafka.Client(`${process.env.ZOOKEEPER}/`);
  client.on('error', error => {
    log('Got a client error: %s', error);
  });
} else {
  // kafka-node >= 4.0.0, they dropped Zookeeper support, client connects directly to kafka
  client = new kafka.KafkaClient({ kafkaHost: '127.0.0.1:9092' });
  client.on('error', error => {
    log('Got a client error: %s', error);
  });
}

let producer;
if (process.env.PRODUCER_TYPE === 'highLevel') {
  log('Using HighLevelProducer');
  producer = new kafka.HighLevelProducer(client);
} else {
  log('Using Producer');
  producer = new kafka.Producer(client);
}

producer.on('error', error => {
  log('Got a producer error: %s', error);
});

producer.on('ready', () => {
  log('Producer is now ready');
});

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('OK');
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

app.post('/send-message', (req, res) => {
  const key = req.body.key;
  const value = req.body.value;

  log('Sending message with key %s and value %s', key, value);
  producer.send(
    [
      {
        topic: 'test',
        messages: new kafka.KeyedMessage(key, value)
      }
    ],
    err => {
      if (err) {
        log('Failed to send message with key %s', key, err);
        res.status(500).send('Failed to send message');
        return;
      }

      log('Message was sent.');
      fetch(`http://127.0.0.1:${agentPort}`)
        .then(() => {
          res.sendStatus(200);
        })
        .catch(err2 => {
          log(err2);
          res.sendStatus(500);
        });
    }
  );
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Kafka Producer (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
