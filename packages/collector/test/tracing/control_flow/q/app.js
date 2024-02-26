/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const instana = require('../../../..')();

const fs = require('fs');
const path = require('path');

const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
const express = require('express');
const morgan = require('morgan');
const Q = require('q');
const port = require('../../../test_util/app-port')();

const agentPort = process.env.INSTANA_AGENT_PORT;
const app = express();
const logPrefix = `q app (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/fcall', (req, res) => Q.fcall(() => 'value').then(() => sendResponse(res)));

app.get('/reject-fcall', (req, res) =>
  Q.fcall(() => {
    throw new Error('test error');
  }).catch(() => sendResponse(res))
);

app.get('/deferred', (req, res) => {
  doSomethingAsync().then(() => sendResponse(res));
});

app.get('/reject-deferred', (req, res) => {
  doSomethingAsyncWithError()
    .then(() => sendResponse(res))
    .catch(err => sendResponse(res, err));
});

app.get('/promise', (req, res) => {
  Q.Promise(resolve => {
    setTimeout(() => resolve(), 10);
  }).then(() => sendResponse(res));
});

app.get('/sequence', (req, res) => {
  doSomethingAsync()
    .then(doSomethingAsync)
    .then(doSomethingAsync)
    .then(doSomethingAsync)
    .then(() => sendResponse(res))
    .catch(err => sendResponse(res, err));
});

app.get('/nested', (req, res) => {
  doSomethingAsync().then(() =>
    //
    doSomethingAsync().then(() =>
      //
      doSomethingAsync().then(() =>
        //
        doSomethingAsync().then(() => sendResponse(res))
      )
    )
  );
});

app.get('/all', (req, res) => {
  Q.all([doSomethingAsync(), doSomethingAsync(), doSomethingAsync()])
    .then(() => sendResponse(res))
    .catch(err => sendResponse(res, err));
});

app.get('/all-settled', (req, res) => {
  Q.allSettled([doSomethingAsync(), doSomethingAsync(), doSomethingAsync()])
    .then(() => sendResponse(res))
    .catch(err => sendResponse(res, err));
});

app.get('/spread', (req, res) => {
  Q.all([doSomethingAsync(), doSomethingAsync(), doSomethingAsync()])
    .spread(() => sendResponse(res))
    .catch(err => sendResponse(res, err));
});

app.get('/any', (req, res) => {
  Q.all([doSomethingAsync(), doSomethingAsync(), doSomethingAsync()])
    .then(() => sendResponse(res))
    .catch(err => sendResponse(res, err));
});

app.get('/tap', (req, res) => {
  doSomethingAsync()
    .delay(20)
    // eslint-disable-next-line no-console
    .tap(console.log)
    .then(() => sendResponse(res))
    .catch(err => sendResponse(res, err));
});

app.get('/for-each-pattern', (req, res) => {
  const promises = [doSomethingAsync, doSomethingAsync, doSomethingAsync];
  let result = Q(doSomethingAsync);
  promises.forEach(value => {
    result = result.then(value);
    return result;
  });
  result.then(() => sendResponse(res));
});

app.get('/reduce-pattern', (req, res) => {
  [doSomethingAsync, doSomethingAsync, doSomethingAsync]
    .reduce(
      (soFar, f) => soFar.then(f),
      Q(doSomethingAsync) //
    )
    .then(() => sendResponse(res));
});

app.get('/compact-reduce-pattern', (req, res) => {
  [doSomethingAsync, doSomethingAsync, doSomethingAsync]
    .reduce(Q.when, Q(doSomethingAsync))
    .then(() => sendResponse(res));
});

app.get('/progress', (req, res) => {
  doSomethingAsyncWithProgress().then(
    () => sendResponse(res),
    err => sendResponse(res, err),
    progress => log(`progress: ${progress}`)
  );
});

app.get('/delay', (req, res) => {
  Q.delay(10).then(() => sendResponse(res));
});

app.get('/delay2', (req, res) => {
  Q.delay(10)
    .then(() => Q.delay(10))
    .then(() => sendResponse(res));
});

app.get('/timeout', (req, res) => {
  doSomethingAsync()
    .timeout(1, 'Boom!')
    .then(() => sendResponse(res))
    .catch(err => sendResponse(res, err));
});

app.get('/nodeify', (req, res) => {
  doSomethingAsync().nodeify(err => {
    if (err) {
      sendResponse(res, err);
    }
    sendResponse(res);
  });
});

app.get('/make-node-resolver', (req, res) => {
  const deferred = Q.defer();
  fs.readFile(path.join(__dirname, 'app.js'), deferred.makeNodeResolver());
  deferred.promise.then(
    () => sendResponse(res),
    err => sendResponse(res, err)
  );
});

app.get('/with-event-emitter', (req, res) => {
  const deferred = Q.defer();
  const emitter = new EventEmitter();

  emitter.on('a', value => {
    deferred.resolve(value);
  });
  deferred.promise.then(() => sendResponse(res));

  setTimeout(() => emitter.emit('a', 1), 10);
});

app.get('/entry-exit', (req, res) => {
  const deferred = Q.defer();
  fetch(`http://127.0.0.1:${agentPort}`)
    .then(() => deferred.resolve())
    .catch(e => deferred.reject(e));
  return deferred.promise.then(() => sendResponse(res)).catch(e => sendResponse(res, e));
});

function sendResponse(res, err) {
  const responsePayload = {};
  responsePayload.span = instana.currentSpan().span;
  if (err) {
    responsePayload.error = err.message;
  }
  res.json(responsePayload);
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function doSomethingAsync() {
  const deferred = Q.defer();
  log('starting an async task');
  setTimeout(() => {
    log('finished the async task');
    deferred.resolve('value');
  }, 10);
  return deferred.promise;
}

function doSomethingAsyncWithError() {
  const deferred = Q.defer();
  log('starting an async task');
  setTimeout(() => {
    log('failed executing the async task');
    deferred.reject(new Error('Boom!'));
  }, 10);
  return deferred.promise;
}

function doSomethingAsyncWithProgress() {
  let i = 0;
  const deferred = Q.defer();
  log('starting an async task');
  const intervalHandle = setInterval(() => {
    deferred.notify(i++);
  }, 1);
  setTimeout(() => {
    clearInterval(intervalHandle);
    log('finished the async task');
    deferred.resolve('value');
  }, 10);
  return deferred.promise;
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
