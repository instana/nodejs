/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../..')();

const express = require('express');
const natsStreaming = require('node-nats-streaming');

const app = express();
const client = natsStreaming.connect('test-cluster', 'test-client-publisher-1', {
  url: process.env.NATS_STREAMING
});
const client2 = natsStreaming.connect('test-cluster', 'test-client-publisher-2', {
  url: process.env.NATS_STREAMING_ALTERNATIVE
});
const port = require('../../../test_util/app-port')();

let connected = false;
let client1Connected = false;
let client2Connected = false;

client.on('connect', () => {
  client1Connected = true;
  if (client2Connected) {
    connected = true;
  }
});
client2.on('connect', () => {
  client2Connected = true;
  if (client1Connected) {
    connected = true;
  }
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
  fetch(`http://127.0.0.1:${agentPort}/ping`)
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

app.post('/two-different-target-hosts', async (req, res) => {
  const message1 = 'message for client 1';
  const message2 = 'message for client 2';
  const subject = 'publish-test-subject';

  client.publish(subject, message1, err1 => {
    if (err1) {
      return res.status(500).send(err1.message ? err1.message : err1);
    } else {
      client2.publish(subject, message2, err2 => {
        if (err2) {
          return res.status(500).send(err2.message ? err2.message : err2);
        } else {
          return res.status(200).send('OK');
        }
      });
    }
  });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `NATS Streaming Publisher (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
