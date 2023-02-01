/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../..')();

const request = require('request-promise');
const express = require('express');
const NATS = require('nats');

const app = express();
const port = require('../../../test_util/app-port')();
const nats = NATS.connect();
let connected = false;

let mostRecentEmittedError = null;

nats.on('connect', () => {
  connected = true;
  nats.on('error', err => {
    mostRecentEmittedError = err;
    log('NATS has emitted an error', err.message);
  });
});

app.get('/', (req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.post('/publish', (req, res) => {
  const withCallback = req.query.withCallback;
  const withReply = req.query.withReply;
  const withError = req.query.withError;
  const isSubscribeTest = req.query.subscribeTest;
  let subject;
  if (isSubscribeTest) {
    subject = 'subscribe-test-subject';
  } else if (withError) {
    // try to publish without a subject to cause an error
    subject = null;
  } else {
    subject = 'publish-test-subject';
  }
  const message = withError && isSubscribeTest ? 'trigger an error' : "It's nuts, ain't it?!";

  const args = [subject, message];

  if (withReply) {
    args.push('test-reply');
  } else if (withError) {
    // Try to publish a message without a subject to trigger an error here in the publisher.
    args.push(null);
  }
  if (withCallback) {
    args.push(err => {
      afterPublish(res, err);
    });
  }

  try {
    nats.publish.apply(nats, args);
    if (!withCallback) {
      return afterPublish(res);
    }
  } catch (e) {
    return afterPublish(res, e);
  }
});

function afterPublish(res, err, msg) {
  if (!err && mostRecentEmittedError) {
    // Starting with nats@1.4.12, nats no longer throws publisher errors synchronously but rather emits them as error
    // events only. If the nats.on('error', ...) event listener received an error, we return it in the response, as it
    // has been caused by the most recent publish.
    err = mostRecentEmittedError;
    mostRecentEmittedError = null;
  }
  request(`http://127.0.0.1:${agentPort}`)
    .then(() => {
      // nats has a bug that makes the callback called twice in some situations
      if (!res.headersSent) {
        if (err) {
          return res.status(500).send(err.message);
        } else if (msg) {
          return res.status(200).send(msg);
        } else {
          return res.status(200).send('OK');
        }
      }
    })
    .catch(err2 => {
      log(err2);
      res.sendStatus(500);
    });
}

app.post('/request', (req, res) => {
  const withError = req.query.withError;
  const requestOne = req.query.requestOne;
  const requestCallback = reply => {
    afterPublish(res, null, reply);
  };

  const natsPublishMethod = requestOne ? nats.request.bind(nats) : nats.requestOne.bind(nats);

  if (withError) {
    try {
      // try to publish without a subject to cause an error
      natsPublishMethod(null, 'awaiting reply', requestCallback);
    } catch (e) {
      afterPublish(res, e);
    }
  } else {
    natsPublishMethod('publish-test-subject', 'awaiting reply', requestCallback);
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `NATS Publisher (${process.pid}):\t${args[0]}`;
  console.log.apply(console, args);
}
