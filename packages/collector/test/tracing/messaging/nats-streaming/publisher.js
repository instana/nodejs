/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../..')();

const request = require('request-promise');
const express = require('express');
const natsStreaming = require('node-nats-streaming');

const app = express();
const client = natsStreaming.connect('test-cluster', 'test-client-publisher', {
  url: 'nats://localhost:4223'
});
const port = require('../../../test_util/app-port')();
let connected = false;

client.on('connect', () => {
  connected = true;
});

client.on('close', () => {
  process.exit();
});

app.get('/', (req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.post('/publish', (req, res) => {
  const withError = req.query.withError;
  const isSubscribeTest = req.query.subscribeTest;
  const message = isSubscribeTest && withError ? `${req.query.id} trigger an error` : req.query.id;
  let subject;
  if (isSubscribeTest) {
    subject = 'subscribe-test-subject';
  } else if (withError) {
    // try to publish without a subject to cause an error
    subject = null;
  } else {
    subject = 'publish-test-subject';
  }

  client.publish(subject, message, (err, guid) => {
    if (err) {
      log(`publish failed: ${err}`);
      afterPublish(res, err);
    } else {
      log(`published message with guid: ${guid}`);
      afterPublish(res);
    }
  });
});

function afterPublish(res, err) {
  request(`http://127.0.0.1:${agentPort}`)
    .then(() => {
      if (err) {
        return res.status(500).send(err.message ? err.message : err);
      } else {
        return res.status(200).send('OK');
      }
    })
    .catch(err2 => {
      log(err2);
      res.sendStatus(500);
    });
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `NATS Streaming Publisher (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
