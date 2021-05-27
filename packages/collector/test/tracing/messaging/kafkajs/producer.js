/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

require('../../../../')();

const request = require('request-promise');
const bodyParser = require('body-parser');
const express = require('express');
const { Kafka } = require('kafkajs');

const appPort = process.env.APP_PORT || 3216;
const agentPort = process.env.INSTANA_AGENT_PORT || 42699;
const runAsStandAlone = !!process.env.RUN_AS_STAND_ALONE;

const kafka = new Kafka({
  clientId: 'test-producer',
  brokers: ['127.0.0.1:9092'],
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

app.get('/', (_req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.sendStatus(503);
  }
});

app.listen(appPort, () => {
  log(`Listening on port: ${appPort}`);
});

app.post('/send-messages', (req, res) => {
  const { key = 'key', value = 'value', error, useSendBatch } = req.body;
  if (error === 'sender') {
    log('Triggering an error on sending.');
  } else {
    log('Sending messages with key %s and value %s using %s.', key, value, useSendBatch ? 'sendBatch' : 'sendMessage');
  }
  send(req.body)
    .then(() => (runAsStandAlone ? Promise.resolve() : request(`http://127.0.0.1:${agentPort}`)))
    .then(() => res.sendStatus(200))
    .then(() => console.log('Messages have been sent.')) // eslint-disable-line
    .catch(err => {
      if (error === 'sender') {
        log('Send error has been triggered.', err.message);
        (runAsStandAlone ? Promise.resolve() : request(`http://127.0.0.1:${agentPort}`))
          .then(() => res.sendStatus(200))
          .catch(err2 => {
            log('Follow up request failed', err2);
            res.sendStatus(200);
          });
      } else {
        log('Failed to send message with key %s', key, err);
        res.status(500).send('Failed to send message');
      }
    });
});

function send({ key = 'key', value = 'value', error, useSendBatch, useEachBatch }) {
  const topicPrefix = useEachBatch ? 'test-batch-topic' : 'test-topic';
  if (error === 'receiver') {
    value = 'Boom!';
  }
  if (useSendBatch) {
    return sendViaSendBatch(key, value, error, topicPrefix);
  } else {
    return sendViaSend(key, value, error, topicPrefix);
  }
}

function sendViaSend(key, value, error, topicPrefix) {
  if (error === 'sender') {
    return producer.send({
      topic: `${topicPrefix}-1`,
      messages: [{}, {}]
    });
  } else {
    return producer.send({
      topic: `${topicPrefix}-1`,
      messages: [
        { key, value },
        { key, value }
      ]
    });
  }
}

function sendViaSendBatch(key, value, error, topicPrefix) {
  if (error === 'sender') {
    return producer.sendBatch({
      topicMessages: [
        {
          topic: `${topicPrefix}-1`,
          messages: [{}, {}]
        },
        {
          topic: `${topicPrefix}-2`,
          messages: [{}]
        }
      ]
    });
  } else {
    return producer.sendBatch({
      topicMessages: [
        {
          topic: `${topicPrefix}-1`,
          messages: [
            { key, value },
            { key, value }
          ]
        },
        {
          topic: `${topicPrefix}-2`,
          messages: [{ key, value }]
        }
      ]
    });
  }
}

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = `Kafka Producer (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args); // eslint-disable-line
}
