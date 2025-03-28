#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

require('@instana/core/test/test_util/mockRequireExpress');

const instana = require('../../..')();
const express = require('express');
const morgan = require('morgan');
const { delay, getTestAppLogger } = require('@instana/core/test/test_util');
const port = require('../../test_util/app-port')();
const app = express();
const logPrefix = `SDK entry span context (${process.pid}):\t`;
const log = getTestAppLogger(logPrefix);

const spanName = 'span-name';
const parentContextAnnotation = 'sdk.custom.tags.parent-context';
const defaultDelayBetweenIterations = 10;
const defaultDurationOfSpans = 5;

let delayBetweenIterations = defaultDelayBetweenIterations;
if (process.env.DELAY) {
  delayBetweenIterations = parseInt(process.env.DELAY, 10);
  if (Number.isNaN(delayBetweenIterations)) {
    delayBetweenIterations = defaultDelayBetweenIterations;
  }
}

let durationOfSpans = defaultDurationOfSpans;
if (process.env.SPAN_DURATION) {
  durationOfSpans = parseInt(process.env.DELAY, 10);
  if (Number.isNaN(durationOfSpans)) {
    durationOfSpans = defaultDelayBetweenIterations;
  }
}

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.get('/', (req, res) => {
  res.sendStatus(200);
});

async function createSdkSpanRecursiveAsync(iterationsDone, maxIterations) {
  await instana.sdk.async.startEntrySpan(spanName);
  annotateWithParentContext();
  await delay(durationOfSpans);
  instana.sdk.async.completeEntrySpan();

  iterationsDone++;
  if (iterationsDone < maxIterations) {
    await new Promise(resolve => {
      setTimeout(() => {
        return createSdkSpanRecursivePromise(iterationsDone, maxIterations).then(resolve);
      }, delayBetweenIterations);
    });
  }
}

async function createSdkSpanNonRecursiveAsync() {
  await instana.sdk.async.startEntrySpan(spanName);
  annotateWithParentContext();
  await delay(durationOfSpans);
  instana.sdk.async.completeEntrySpan();
}

function createSdkSpanRecursivePromise(iterationsDone, maxIterations) {
  return instana.sdk.promise
    .startEntrySpan(spanName)
    .then(annotateWithParentContext)
    .then(() => delay(durationOfSpans))
    .then(instana.sdk.promise.completeEntrySpan)
    .then(() => {
      iterationsDone++;
      if (iterationsDone < maxIterations) {
        return new Promise(resolve => {
          setTimeout(() => {
            return createSdkSpanRecursivePromise(iterationsDone, maxIterations).then(resolve);
          }, delayBetweenIterations);
        });
      } else {
        return Promise.resolve();
      }
    });
}

function createSdkSpanNonRecursivePromise() {
  return instana.sdk.promise
    .startEntrySpan(spanName)
    .then(annotateWithParentContext)
    .then(() => delay(durationOfSpans))
    .then(instana.sdk.promise.completeEntrySpan);
}

function createSdkSpanRecursiveCallback(iterationsDone, maxIterations, cb) {
  instana.sdk.callback.startEntrySpan('span-name', () => {
    annotateWithParentContext();

    setTimeout(() => {
      instana.sdk.callback.completeEntrySpan();

      iterationsDone++;
      if (iterationsDone < maxIterations) {
        setTimeout(() => {
          createSdkSpanRecursiveCallback(iterationsDone, maxIterations, () => {
            cb();
          });
        }, delayBetweenIterations);
      } else {
        cb();
      }
    }, durationOfSpans);
  });
}

function createSdkSpanNonRecursiveCallback(cb) {
  instana.sdk.callback.startEntrySpan(spanName, () => {
    annotateWithParentContext();
    setTimeout(() => {
      instana.sdk.callback.completeEntrySpan();
      cb();
    }, durationOfSpans);
  });
}

process.on('message', async message => {
  if (typeof message !== 'object' || Array.isArray(message)) {
    return process.send(`error: malformed message, only non-array objects are allowed: ${JSON.stringify(message)}`);
  }
  if (!message.callPattern) {
    return process.send(`error: message has no callPattern attribute: ${JSON.stringify(message)}`);
  }
  if (!message.apiType) {
    return process.send(`error: message has no apiType attribute: ${JSON.stringify(message)}`);
  }
  let maxIterations = 5;
  if (message.iterations) {
    maxIterations = message.iterations;
  }

  switch (message.callPattern) {
    case 'recursive':
      recursive(message.apiType, maxIterations);
      break;
    case 'non-recursive':
      nonRecursive(message.apiType, maxIterations);
      break;
    default:
      process.send(`error: unknown callPattern: ${message.callPattern}`);
  }
});

async function recursive(apiType, maxIterations) {
  switch (apiType) {
    case 'async':
      await createSdkSpanRecursiveAsync(0, maxIterations);
      return process.send('done');

    case 'promise':
      createSdkSpanRecursivePromise(0, maxIterations).then(() => {
        return process.send('done');
      });
      break;

    case 'callback':
      createSdkSpanRecursiveCallback(0, maxIterations, () => {
        return process.send('done');
      });
      break;

    default:
      process.send(`error: unknown apiType: ${apiType}`);
  }
}

async function nonRecursive(apiType, maxIterations) {
  let iterationsDone = 0;
  let handle;

  switch (apiType) {
    case 'async':
      new Promise(resolve => {
        handle = setInterval(async () => {
          await createSdkSpanNonRecursiveAsync();
          iterationsDone++;
          if (iterationsDone >= maxIterations) {
            resolve();
          }
        }, delayBetweenIterations + durationOfSpans);
      }).then(() => {
        clearInterval(handle);
        process.send('done');
      });
      break;

    case 'promise':
      new Promise(resolve => {
        handle = setInterval(async () => {
          createSdkSpanNonRecursivePromise().then(() => {
            iterationsDone++;
            if (iterationsDone >= maxIterations) {
              resolve();
            }
          });
        }, delayBetweenIterations + durationOfSpans);
      }).then(() => {
        clearInterval(handle);
        process.send('done');
      });
      break;

    case 'callback':
      // eslint-disable-next-line no-case-declarations, no-inner-declarations
      function stop() {
        clearInterval(handle);
        process.send('done');
      }

      handle = setInterval(async () => {
        createSdkSpanNonRecursiveCallback(() => {
          iterationsDone++;
          if (iterationsDone >= maxIterations) {
            stop();
          }
        });
      }, delayBetweenIterations + durationOfSpans);
      break;

    default:
      process.send(`error: unknown apiType: ${apiType}`);
  }
}

function annotateWithParentContext() {
  const cls = instana.core.tracing.getCls();
  const prototypeOfActiveContext = cls && cls.ns.active ? Object.getPrototypeOf(cls.ns.active) : null;
  instana.currentSpan().annotate(parentContextAnnotation, prototypeOfActiveContext);
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
