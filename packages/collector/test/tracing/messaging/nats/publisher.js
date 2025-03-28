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

require('@instana/core/test/test_util/mockRequireExpress');

const agentPort = process.env.INSTANA_AGENT_PORT;

require('./mockVersion');
require('../../../..')();

const fetch = require('node-fetch-v2');
const express = require('express');
const NATS = require('nats');

const log = require('@instana/core/test/test_util/log').getLogger('NATS Publisher');

const app = express();
const port = require('../../../test_util/app-port')();
const connectionError = process.env.CONNECT_ERROR === 'true';
const IS_LATEST = process.env.NATS_VERSION === 'latest';

let sc;
let natsClient;
let natsClient2;

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
      natsClient = await NATS.connect({ servers: process.env.NATS });
      natsClient2 = await NATS.connect({ servers: process.env.NATS_ALTERNATIVE });
      connected = true;
    }
  })();
} else {
  if (connectionError) {
    natsClient = NATS.connect({ servers: ['deno.nats.io:4323'] });
  } else {
    natsClient = NATS.connect({ servers: [process.env.NATS] });
  }
  natsClient2 = NATS.connect({ servers: [process.env.NATS_ALTERNATIVE] });

  let client1Connected = false;
  let client2Connected = false;

  natsClient.on('connect', () => {
    client1Connected = true;
    if (client2Connected) {
      connected = true;
    }
  });
  natsClient2.on('connect', () => {
    client2Connected = true;
    if (client1Connected) {
      connected = true;
    }
  });

  natsClient.on('error', err => {
    mostRecentEmittedError = err;
    connectionErrorMsg = err.message;
    log('NATS has emitted an error', err.message);
  });
  natsClient2.on('error', err => {
    mostRecentEmittedError = err;
    connectionErrorMsg = err.message;
    log('NATS (client 2) has emitted an error', err.message);
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
    natsClient.publish.apply(natsClient, args);
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

  fetch(`http://127.0.0.1:${agentPort}`)
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
    requestOne && process.env.NATS_VERSION === 'v1'
      ? natsClient.requestOne.bind(natsClient)
      : natsClient.request.bind(natsClient);

  if (withError) {
    try {
      // try to publish without a subject to cause an error
      if (IS_LATEST) {
        await natsClient.request(null, sc.encode('awaiting reply nats2'));
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
      await natsClient
        .request('publish-test-subject', sc.encode('awaiting reply'), { reply: 'test', noMux: true })
        .then(m => {
          afterPublish(res, null, sc.decode(m.data), true);
        });
    } else {
      await natsClient.request('publish-test-subject', sc.encode('awaiting reply'), { noMux: false }).then(m => {
        afterPublish(res, null, sc.decode(m.data), true);
      });
    }
  } else {
    natsPublishMethod('publish-test-subject', 'awaiting reply', requestCallback);
  }
});

app.post('/two-different-target-hosts', async (req, res) => {
  const subject = 'publish-test-subject';
  let message1 = 'message for client 1';
  let message2 = 'message for client 2';

  if (IS_LATEST) {
    message1 = sc.encode(message1);
    message2 = sc.encode(message2);
  }
  try {
    natsClient.publish(subject, message1);
    natsClient2.publish(subject, message2);
    return res.sendStatus(200);
  } catch (e) {
    return res.sendStatus(500);
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
