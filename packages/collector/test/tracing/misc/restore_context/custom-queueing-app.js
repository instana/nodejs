'use strict';

const instana = require('../../../../')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const pino = require('pino')();

const app = express();
const logPrefix = `Restore Context (${process.pid}):\t`;
const port = process.env.APP_PORT || 3222;

const customCallbackQueue = [];
const customPromiseQueue = [];

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.post('/run', (req, res) => {
  const activeContext = instana.sdk.getAsyncContext();
  customCallbackQueue.push(() => {
    instana.sdk.runInAsyncContext(activeContext, () => {
      pino.warn('Should be traced.');
      return res.sendStatus(200);
    });
  });
});

app.post('/run-promise', (req, res) => {
  const activeContext = instana.sdk.getAsyncContext();
  customPromiseQueue.push(() => {
    return instana.sdk.runPromiseInAsyncContext(activeContext, createPromise.bind(null, res));
  });
});

app.post('/enter-and-leave', (req, res) => {
  const activeContext = instana.sdk.getAsyncContext();
  customCallbackQueue.push(() => {
    instana.core.tracing.getCls().enterAsyncContext(activeContext);
    pino.warn('Should be traced.');
    res.sendStatus(200);
    instana.core.tracing.getCls().leaveAsyncContext(activeContext);
  });
});

function createPromise(res) {
  return new Promise(resolve => {
    pino.warn('Should be traced.');
    res.sendStatus(200);
    resolve();
  });
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

/**
 * A simplified version of a custom userland queueing mechanism that will break async_hooks continuity. processQueues is
 * triggered globally and not from the individual incoming HTTP requests, so we would not be able to trace the work that
 * is happening in the work items, unless instana.sdk.getAsyncContext/instana.sdk.runInAsyncContext is used.
 */
function processQueues() {
  if (customCallbackQueue.length > 0) {
    const queuedCallback = customCallbackQueue.shift();
    queuedCallback();
  }

  if (customPromiseQueue.length > 0) {
    const queuedPromise = customPromiseQueue.shift();
    queuedPromise().then(() => log('done'));
  }

  setTimeout(processQueues, 50).unref();
}

processQueues();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
