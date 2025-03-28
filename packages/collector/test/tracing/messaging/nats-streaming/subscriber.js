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

const instana = require('../../../..')();

require('@instana/core/test/test_util/mockRequireExpress');
const express = require('express');
const fetch = require('node-fetch-v2');
const natsStreaming = require('node-nats-streaming');

const app = express();
const port = require('../../../test_util/app-port')();
const client = natsStreaming.connect('test-cluster', 'test-client-subscriber', {
  url: process.env.NATS_STREAMING
});
let connected = false;

client.on('connect', () => {
  const opts1 = client.subscriptionOptions().setStartWithLastReceived();
  const subscriptionForPublishTest = client.subscribe('publish-test-subject', opts1);
  subscriptionForPublishTest.on('message', msg => {
    log(`received: [${msg.getSequence()}] ${msg.getData()}`);
    if (process.send) {
      process.send(msg.getData());
    }
  });
  subscriptionForPublishTest.on('error', err => {
    log('received error event', err);
  });

  const opts2 = client
    .subscriptionOptions()
    .setStartWithLastReceived()
    .setManualAckMode(true)
    .setAckWait(5 * 1000);
  const subscriptionForSubscribeTest = client.subscribe('subscribe-test-subject', opts2);
  subscriptionForSubscribeTest.on('message', msg => {
    log(`received: [${msg.getSequence()}] ${msg.getData()}`);
    msg.ack();
    const span = instana.currentSpan();
    span.disableAutoEnd();
    if (process.send) {
      process.send(msg.getData());
    }
    try {
      if (msg.getData().indexOf('trigger an error') >= 0) {
        log('triggering an error...');
        // attach unique message ID to error text
        throw new Error(`Boom: ${msg.getData().substring(0, 36)}`);
      }
    } finally {
      setTimeout(() => {
        fetch(`http://127.0.0.1:${agentPort}`)
          .then(() => {
            log('The follow up request after receiving a message has happened.');
            span.end();
          })
          .catch(err => {
            log('The follow up request after receiving a message has failed.', err);
            span.end(1);
          });
      }, 100);
    }
  });
  subscriptionForSubscribeTest.on('error', err => {
    log('received error event', err.message);
  });

  connected = true;
});

app.get('/', (req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `NATS Streaming Subscriber (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
