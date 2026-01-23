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

const agentPort = process.env.INSTANA_AGENT_PORT;

const instana = require('../../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const { sendToParent } = require('../../../../../../core/test/test_util');
const { createTopicAndSubscription } = require('./pubsubUtil');

const port = require('../../../../test_util/app-port')();
const logPrefix = `Google Cloud Pub/Sub Subscriber (${process.pid}):\t`;

let connected = false;

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

async function connect() {
  try {
    const { subscription } = await createTopicAndSubscription(log);
    log(`listening to ${subscription.name}`);

    subscription.on('message', msg => {
      const span = instana.currentSpan();
      span.disableAutoEnd();
      msg.ack();
      const content = msg.data.toString();
      sendToParent({ id: msg.id, content });

      log(`received message: ${msg.id} from ${subscription.name} with content "${content}"`);
      setTimeout(() => {
        fetch(`http://127.0.0.1:${agentPort}/ping`)
          .then(response => response.json())
          .then(() => {
            log('The follow up request after receiving a message has happened.');
            span.end();
          })
          .catch(err => {
            log('The follow up request after receiving a message has failed.', err);
            span.end(1);
          });
      }, 100);
    });

    subscription.on('error', error => {
      log('received error:', error);
      sendToParent(error);
    });

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

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix}${args[0]}`;
  console.log.apply(console, args);
}
