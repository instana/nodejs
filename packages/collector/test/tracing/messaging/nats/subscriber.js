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
require('./mockVersion');

const instana = require('../../../..')();
const express = require('express');
const fetch = require('node-fetch-v2');
const NATS = require('nats');

const log = require('@instana/core/test/test_util/log').getLogger('NATS Subscriber: ');

const app = express();
const port = require('../../../test_util/app-port')();
let connected = false;
let sc;
let nats;

if (process.env.NATS_VERSION === 'latest') {
  sc = NATS.StringCodec();

  (async function () {
    nats = await NATS.connect({ servers: process.env.NATS });
    connected = true;

    const sub = nats.subscribe('publish-test-subject');

    (async () => {
      // eslint-disable-next-line no-restricted-syntax
      for await (const m of sub) {
        const msg = sc.decode(m.data);
        log(`publish-test-subject: received: "${msg}"`);
        if (process.send) {
          process.send(msg);
        }

        if (msg === 'awaiting reply') {
          log('sending reply');
          m.respond(sc.encode('sending reply'));
        }
      }
    })();

    const sub2 = nats.subscribe('subscribe-test-subject');
    let currentSpan;

    (async () => {
      // eslint-disable-next-line no-restricted-syntax
      for await (const m of sub2) {
        const msg = sc.decode(m.data);
        log(`subscribe-test-subject: received: "${msg}"`);

        const span = (currentSpan = instana.currentSpan());
        span.disableAutoEnd();

        if (process.send) {
          process.send(msg);
        }

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

        // NOTE: simply throwing an error will stop the generator and it is not possible
        //       to capture the error from the instrumentation. Customer needs to manually add the error.
        if (msg === 'trigger an error') {
          log('triggering an error...');
          await Promise.reject(new Error('Boom!'));
        }
      }
    })().catch(err => {
      if (currentSpan) {
        currentSpan.span.ec = 1;
        currentSpan.span.data.nats.error = err.message;
        currentSpan.end();
      }
    });

    nats.subscribe('subscribe-test-3', {
      callback: function (err, m) {
        const msg = sc.decode(m.data);
        log(`subscribe-test-3: received: "${msg}"`);

        const span = instana.currentSpan();
        span.disableAutoEnd();

        if (process.send) {
          process.send(msg);
        }

        setTimeout(() => {
          fetch(`http://127.0.0.1:${agentPort}`)
            .then(() => {
              log('The follow up request after receiving a message has happened.');
              span.end();
            })
            .catch(e => {
              log('The follow up request after receiving a message has failed.', e);
              span.end(1);
            });
        }, 100);
      }
    });
  })();
} else {
  nats = NATS.connect({ servers: [process.env.NATS] });
  nats.on('connect', () => {
    connected = true;

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
  });

  nats.on('error', err => {
    log('NATS error', err);
  });
}

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
