/* eslint-disable no-console */
/* global Promise */

'use strict';

const instana = require('../../../../')();

const request = require('request');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
const express = require('express');
const morgan = require('morgan');

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
    request('http://127.0.0.1:65212', (err, response) => {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
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

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}
