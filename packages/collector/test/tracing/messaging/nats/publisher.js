'use strict';

const agentPort = process.env.AGENT_PORT;

require('../../../../')({
  agentPort,
  level: process.env.INSTANA_LOG_LEVEL || 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1
  }
});

const request = require('request-promise');
const express = require('express');
const NATS = require('nats');

const app = express();
const port = process.env.APP_PORT || 3216;
const nats = NATS.connect();
let connected = false;

nats.on('connect', function() {
  connected = true;
  nats.on('error', function(err) {
    log('NATS error', err);
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
  const requestCallback = function(reply) {
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
