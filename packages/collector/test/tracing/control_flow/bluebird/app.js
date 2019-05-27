/* eslint-disable no-undef */
/* eslint-disable no-console */

'use strict';

const instana = require('../../../../');
instana({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const request = require('request-promise');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
const Promise = require('bluebird');
const express = require('express');
const morgan = require('morgan');

const app = express();
const logPrefix = `Express / bluebird App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/delayed', (req, res) => {
  Promise.delay(50).then(sendActiveTraceContext.bind(null, res));
});

app.get('/childPromise', (req, res) => {
  Promise.delay(50)
    .then(() => Promise.delay(20))
    .then(sendActiveTraceContext.bind(null, res));
});

app.get('/childPromiseWithChildSend', (req, res) => {
  Promise.delay(50).then(() => Promise.delay(20).then(sendActiveTraceContext.bind(null, res)));
});

app.get('/combined', (req, res) => {
  Promise.all([Promise.delay(50), Promise.delay(40)]).then(sendActiveTraceContext.bind(null, res));
});

app.get('/rejected', (req, res) => {
  Promise.all([Promise.delay(50), Promise.reject(new Error('bad timing'))]).catch(
    sendActiveTraceContext.bind(null, res)
  );
});

app.get('/childHttpCall', (req, res) => {
  request('http://127.0.0.1:65212')
    .catch(() => Promise.delay(20))
    .then(() => {
      sendActiveTraceContext(res);
    });
});

app.get('/rejected', (req, res) => {
  Promise.all([Promise.delay(50), Promise.reject(new Error('bad timing'))]).catch(
    sendActiveTraceContext.bind(null, res)
  );
});

app.get('/map', (req, res) => {
  Promise.map([Promise.delay(20), Promise.resolve(42)], v => v * 2).then(sendActiveTraceContext.bind(null, res));
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
