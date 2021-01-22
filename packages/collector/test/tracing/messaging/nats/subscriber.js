/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

const agentPort = process.env.INSTANA_AGENT_PORT;

const instana = require('../../../../')();

const express = require('express');
const request = require('request-promise');
const NATS = require('nats');

const app = express();
const port = process.env.APP_PORT || 3215;
const nats = NATS.connect();
let connected = false;

nats.on('connect', () => {
  connected = true;
  nats.on('error', err => {
    log('NATS error', err);
  });

  nats.subscribe('publish-test-subject', (msg, replyTo) => {
    log(`received: "${msg}"`);
    if (process.send) {
      process.send(msg);
    }
    if (msg === 'awaiting reply') {
      log('sending reply');
      nats.publish(replyTo, 'sending reply');
    }
  });

  nats.subscribe('subscribe-test-subject', msg => {
    log(`received: "${msg}"`);
    const span = instana.currentSpan();
    span.disableAutoEnd();
    if (process.send) {
      process.send(msg);
    }
    try {
      if (msg === 'trigger an error') {
        log('triggering an error...');
        throw new Error('Boom!');
      }
    } finally {
      setTimeout(() => {
        request(`http://127.0.0.1:${agentPort}`)
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
  args[0] = `NATS Subscriber (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
