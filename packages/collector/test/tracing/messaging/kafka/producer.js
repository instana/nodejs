/* eslint-disable */

'use strict';

const agentPort = process.env.AGENT_PORT;

require('../../../../')({
  agentPort,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

const request = require('request-promise');
const bodyParser = require('body-parser');
const express = require('express');
const kafka = require('kafka-node');
const app = express();

const client = new kafka.Client(`${process.env.ZOOKEEPER}/`);
client.on('error', error => {
  log('Got a client error: %s', error);
});

const producer = new kafka.Producer(client);
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

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

app.post('/send-message', (req, res) => {
  const key = req.body.key;
  const message = req.body.message;

  log('Sending message with key %s and body %s', key, message);
  producer.send(
    [
      {
        topic: 'test',
        messages: new kafka.KeyedMessage(key, message)
      }
    ],
    err => {
      if (err) {
        log('Failed to send message with key %s', key, err);
        res.status(500).send('Failed to send message');
        return;
      }
      request(`http://127.0.0.1:${agentPort}`)
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
  args[0] = `Express Kafka Producer App (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
