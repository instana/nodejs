/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpressV4');

const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const fetch = require('node-fetch-v2');

const asyncRoute = require('../../../../test_util/asyncExpressRoute');
const { createTopic } = require('./pubsubUtil');

const port = require('../../../../test_util/app-port')();
const logPrefix = `Google Cloud Pub/Sub Publisher (${process.pid}):\t`;

let topic;
let connected = false;

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

async function connect() {
  try {
    ({ topic } = await createTopic(log));
    connected = true;
  } catch (e) {
    log(e);
    process.exit(1);
  }
}

connect();

app.get('/', (req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.status(500).send('Not ready yet.');
  }
});

app.post(
  '/publish-promise',
  asyncRoute(async (req, res) => {
    const messageData = createMessageData(req);
    try {
      const messageId = await topic.publish(messageData);
      afterPublish(null, res, messageId);
      log(`done: publish ${messageId} to ${topic.name} (content: ${messageData.toString()})`);
    } catch (err) {
      log(`failed: publish ${messageData ? messageData.toString() : messageData} to ${topic.name}: ${err}`);
      afterPublish(err, res);
    }
  })
);

app.post('/publish-callback', (req, res) => {
  const messageData = createMessageData(req);
  topic.publish(messageData, (err, messageId) => {
    if (err) {
      log(`failed: publish ${messageData ? messageData.toString() : messageData} to ${topic.name}: ${err}`);
      return afterPublish(err, res);
    }
    afterPublish(null, res, messageId);
    log(`done: publish ${messageId} to ${topic.name} (content: ${messageData.toString()})`);
  });
});

function createMessageData(req) {
  const withError = req.query.withError;

  let subject;
  if (!withError) {
    subject = 'test message';
  } else if (withError === 'publisher') {
    // See change https://github.com/googleapis/nodejs-pubsub/commit/97fd4f041c195e0388b0613b2cf9710b89ab4e15
    // We no longer can send "null"
    // Goal: pubsub module raises error because of wrong input
    return 'this is not a buffer';
  } else {
    throw new Error(`Unknown value for withError: ${withError}.`);
  }
  return Buffer.from(subject);
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function afterPublish(err, res, messageId) {
  fetch(`http://127.0.0.1:${agentPort}`)
    .then(response => response.json())
    .then(() => {
      if (err) {
        return res.status(500).send(err.message);
      } else if (messageId) {
        return res.status(200).send({ messageId });
      } else {
        return res.status(200).send('OK');
      }
    })
    .catch(err2 => {
      log(err2);
      res.sendStatus(500).send(err2.message);
    });
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix}${args[0]}`;
  console.log.apply(console, args);
}
