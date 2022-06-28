/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const agentPort = process.env.INSTANA_AGENT_PORT;

require('./mockVersion');
require('../../../..')();

const request = require('request-promise');
const express = require('express');
const NATS = require('nats');

const app = express();
const port = require('../../../test_util/app-port')();
const connectionError = process.env.CONNECT_ERROR === 'true';
const IS_LATEST = process.env.NATS_VERSION === 'latest';

let sc;
let nats;

let connected = false;
let connectionErrorMsg;
let mostRecentEmittedError = null;
let headers;

if (IS_LATEST) {
  sc = NATS.StringCodec();
  headers = NATS.headers;

  (async function () {
    if (connectionError) {
      try {
        await NATS.connect({ servers: 'deno.nats.io:4323' });
      } catch (connErr) {
        log('Could not connect to nats server.', connErr);
        connectionErrorMsg = connErr.message;
      }
    } else {
      nats = await NATS.connect();
      connected = true;
    }
  })();
} else {
  if (connectionError) {
    nats = NATS.connect({ servers: ['deno.nats.io:4323'] });
  } else {
    nats = NATS.connect();
  }

  nats.on('connect', () => {
    connected = true;
  });

  nats.on('error', err => {
    mostRecentEmittedError = err;
    connectionErrorMsg = err.message;
    log('NATS has emitted an error', err.message);
  });
}

// We already catch the error for await NATS.connect({ servers: 'deno.nats.io:4323' });
// but the application still shuts down, which we do not want.
process.on('uncaughtException', e => {
  log('Catched uncaught', e);
});

app.get('/', (req, res) => {
  if (connected) {
    res.send('OK');
  } else {
    res.status(500).send(connectionErrorMsg || 'Not ready yet.');
  }
});

app.post('/publish', async (req, res) => {
  const withCallback = req.query.withCallback;
  const withReply = req.query.withReply;
  const withError = req.query.withError;
  const isSubscribeTest = req.query.subscribeTest;
  const noHeaders = req.query.noHeaders === 'true';
  const subscribeSubject = req.query.subscribeSubject;
  let subject;

  if (isSubscribeTest && !subscribeSubject) {
    subject = 'subscribe-test-subject';
  } else if (withError) {
    // try to publish without a subject to cause an error
    subject = null;
  } else if (!subscribeSubject) {
    subject = 'publish-test-subject';
  } else {
    subject = subscribeSubject;
  }

  let message = withError && isSubscribeTest ? 'trigger an error' : "It's nuts, ain't it?!";

  if (IS_LATEST) {
    message = sc.encode(message);
  }

  const args = [subject, message];

  if (withReply) {
    if (IS_LATEST) {
      args.push({
        reply: 'test-reply'
      });
    } else {
      args.push('test-reply');
    }
  } else if (withError) {
    // Try to publish a message without a subject to trigger an error here in the publisher.
    args.push(null);
  }

  if (IS_LATEST && !noHeaders) {
    const h = headers();
    h.append('id', '123456');
    h.append('unix_time', Date.now().toString());

    args.push({ headers: h });
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

app.post('/request', async (req, res) => {
  const withError = req.query.withError;
  const requestOne = req.query.requestOne;

  const requestCallback = reply => {
    afterPublish(res, null, reply);
  };

  const natsPublishMethod =
    requestOne && process.env.NATS_VERSION === 'v1' ? nats.requestOne.bind(nats) : nats.request.bind(nats);

  if (withError) {
    try {
      // try to publish without a subject to cause an error
      if (IS_LATEST) {
        await nats.request(null, sc.encode('awaiting reply nats2'));
        afterPublish(res, null);
      } else {
        natsPublishMethod(null, 'awaiting reply', requestCallback);
      }
    } catch (e) {
      afterPublish(res, e);
    }

    return;
  }

  if (IS_LATEST) {
    if (!requestOne) {
      // the client will create a normal subscription for receiving the response to
      // a generated inbox subject before the request is published
      await nats
        .request('publish-test-subject', sc.encode('awaiting reply'), { reply: 'test', noMux: true })
        .then(m => {
          afterPublish(res, null, sc.decode(m.data), true);
        });
    } else {
      await nats.request('publish-test-subject', sc.encode('awaiting reply'), { noMux: false }).then(m => {
        afterPublish(res, null, sc.decode(m.data), true);
      });
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
