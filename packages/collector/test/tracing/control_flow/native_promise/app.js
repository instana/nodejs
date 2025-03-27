/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('../../../..')();
const fetch = require('node-fetch-v2');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
const express = require('express-v4');
const morgan = require('morgan');
const port = require('../../../test_util/app-port')();

const app = express();
const logPrefix = `Express app with native promises (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/delayed', (req, res) => {
  delay(50).then(sendActiveTraceContext.bind(null, res));
});

app.get('/childPromise', (req, res) => {
  delay(50)
    .then(() => delay(20))
    .then(sendActiveTraceContext.bind(null, res));
});

app.get('/childPromiseWithChildSend', (req, res) => {
  delay(50).then(() => delay(20).then(sendActiveTraceContext.bind(null, res)));
});

app.get('/combined', (req, res) => {
  Promise.all([delay(50), delay(40)]).then(sendActiveTraceContext.bind(null, res));
});

app.get('/rejected', (req, res) => {
  Promise.all([delay(50), Promise.reject(new Error('bad timing'))]).catch(sendActiveTraceContext.bind(null, res));
});

app.get('/childHttpCall', (req, res) => {
  new Promise((resolve, reject) => {
    fetch('http://127.0.0.1:65212')
      .then(response => {
        if (!response.ok) {
          // eslint-disable-next-line prefer-promise-reject-errors
          reject(`HTTP error! Status: ${response.status}`);
        } else {
          resolve(response);
        }
      })
      .catch(err => reject(err));
  })
    .catch(() => delay(20))
    .then(() => {
      sendActiveTraceContext(res);
    });
});

app.get('/rejected', (req, res) => {
  Promise.all([delay(50), Promise.reject(new Error('bad timing'))]).catch(sendActiveTraceContext.bind(null, res));
});

app.get('/eventEmitterBased', (req, res) => {
  const emitter = new EventEmitter();

  new Promise(resolve => {
    emitter.on('a', value => {
      resolve(value);
    });
  }).then(() => {
    sendActiveTraceContext(res);
  });

  emitter.emit('a', 1);
});

function sendActiveTraceContext(res) {
  res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext());
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
