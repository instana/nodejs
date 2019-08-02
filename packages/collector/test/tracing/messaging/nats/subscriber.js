'use strict';

const agentPort = process.env.AGENT_PORT;

const instana = require('../../../../')({
  agentPort,
  level: process.env.INSTANA_LOG_LEVEL || 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1
  }
});

const express = require('express');
const request = require('request-promise');
const NATS = require('nats');

const app = express();
const port = process.env.APP_PORT || 3215;
const nats = NATS.connect();
let connected = false;

nats.on('connect', function() {
  connected = true;
  nats.on('error', function(err) {
    log('NATS error', err);
  });

  nats.subscribe('publish-test-subject', function(msg, replyTo) {
    log(`received: "${msg}"`);
    if (process.send) {
      process.send(msg);
    }
    if (msg === 'awaiting reply') {
      log('sending reply');
      nats.publish(replyTo, 'sending reply');
    }
  });

  nats.subscribe('subscribe-test-subject', function(msg) {
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
