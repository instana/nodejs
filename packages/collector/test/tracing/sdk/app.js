/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const agentPort = process.env.INSTANA_AGENT_PORT;

const instana = require('../../..')();

const fs = require('fs');
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const path = require('path');

const port = require('../../test_util/app-port')();
const { delay, getTestAppLogger } = require('@_local/core/test/test_util');
const DummyEmitter = require('./dummyEmitter');

const app = express();
const logPrefix = `SDK: Server (${process.pid}):\t`;
const log = getTestAppLogger(logPrefix);

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.use((req, res, next) => {
  if (req.query.correlationId) {
    instana.currentSpan().setCorrelationId(req.query.correlationId);
  }
  if (req.query.correlationType) {
    instana.currentSpan().setCorrelationType(req.query.correlationType);
  }
  next();
});

app.get('/', (req, res) => {
  res.sendStatus(200);
});

process.on('message', message => {
  if (typeof message !== 'object' || Array.isArray(message)) {
    return process.send(`error: malformed message, only non-array objects are allowed: ${JSON.stringify(message)}`);
  }
  if (!message.command) {
    return process.send(`error: message has no command attribute: ${JSON.stringify(message)}`);
  }
  switch (message.command) {
    case 'start-entry':
      createEntry(message);
      break;
    case 'event-emitter':
      createSpansWithEventEmitter(message);
      break;
    case 'nest-entry-exit':
      nestEntryExit(message);
      break;
    case 'nest-intermediates':
      nestIntermediates(message);
      break;
    case 'synchronous-operations':
      synchronousOperations(message);
      break;
    default:
      process.send(`error: unknown command: ${message.command}`);
  }
});

function createEntry(message) {
  if (!message.type) {
    return process.send(`error: command start-entry needs a type attribute: ${JSON.stringify(message)}`);
  }
  switch (message.type) {
    case 'callback':
      createEntryCallback(message);
      break;
    case 'promise':
      createEntryPromise(message);
      break;
    case 'async':
      createEntryAsync(message);
      break;
    default:
      process.send(`error: unknown command type: ${message.type}`);
  }
}

function createEntryCallback(message) {
  instana.sdk.callback.startEntrySpan(
    'custom-entry',
    message.withData === 'start' || message.withData === 'both' ? Object.freeze({ start: 'whatever' }) : null,
    message.traceId,
    message.parentSpanId,
    () => {
      afterCreateEntry(instana.sdk.callback, message);
    }
  );
}

function createEntryPromise(message) {
  instana.sdk.promise
    .startEntrySpan(
      'custom-entry',
      message.withData === 'start' || message.withData === 'both' ? { start: 'whatever' } : null,
      message.traceId,
      message.parentSpanId
    )
    .then(() => {
      afterCreateEntry(instana.sdk.promise, message);
    });
}

async function createEntryAsync(message) {
  await instana.sdk.async.startEntrySpan(
    'custom-entry',
    message.withData === 'start' || message.withData === 'both' ? { start: 'whatever' } : null,
    message.traceId,
    message.parentSpanId
  );
  afterCreateEntry(instana.sdk.async, message);
}

function afterCreateEntry(instanaSdk, message) {
  setCorrelationAttributesForIpcMessage(message);
  // follow-up with an IO action that is auto-traced to validate tracing context integrity
  fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
    const error = message.error ? new Error('Boom!') : null;
    instanaSdk.completeEntrySpan(
      error,
      message.withData === 'end' || message.withData === 'both' ? Object.freeze({ end: 'some value' }) : null
    );
    process.send(`done: ${message.command}`);
  });
}

function setCorrelationAttributesForIpcMessage(message) {
  if (message.correlationId) {
    instana.currentSpan().setCorrelationId(message.correlationId);
  }
  if (message.correlationType) {
    instana.currentSpan().setCorrelationType(message.correlationType);
  }
}

app.post('/callback/create-intermediate', function createIntermediateCallback(req, res) {
  const file = getFile(req);
  const encoding = 'UTF-8';
  instana.sdk.callback.startIntermediateSpan(
    'intermediate-file-access',
    {
      path: file,
      encoding
    },
    () => {
      afterCreateIntermediate(instana.sdk.callback, file, encoding, res);
    }
  );
});

app.post('/promise/create-intermediate', function createIntermediatePromise(req, res) {
  const file = getFile(req);
  const encoding = 'UTF-8';
  instana.sdk.promise
    .startIntermediateSpan(
      'intermediate-file-access',
      Object.freeze({
        path: file,
        encoding
      })
    )
    .then(() => {
      afterCreateIntermediate(instana.sdk.promise, file, encoding, res);
    });
});

app.post('/async/create-intermediate', async function createIntermediateAsync(req, res) {
  const file = getFile(req);
  const encoding = 'UTF-8';
  await instana.sdk.async.startIntermediateSpan(
    'intermediate-file-access',
    Object.freeze({
      path: file,
      encoding
    })
  );
  afterCreateIntermediate(instana.sdk.async, file, encoding, res);
});

app.post('/async/parallel-intermediates', async (req, res) => {
  const execute = async name => {
    const s = await instana.sdk.async.startIntermediateSpan(name);
    await delay(200);
    await instana.sdk.async.completeIntermediateSpan(null, null, s);
  };

  await Promise.all([execute('eins'), execute('zwei')]);
  res.sendStatus(200);
});

function afterCreateIntermediate(instanaSdk, file, encoding, res) {
  fs.readFile(file, encoding, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
          // intermediate span is finished after the http exit, so the http exit is s child of the intermediate span
          instana.sdk.callback.completeIntermediateSpan(err, { error: err.message });
          return res.sendStatus(404);
        });
      }
      return res.status(500).send(err);
    }
    // trigger another IO action that is auto-traced to validate tracing context integrity
    fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
      // intermediate span is finished after the http exit, so the http exit is s child of the intermediate span
      instana.sdk.callback.completeIntermediateSpan(null, { success: true });
      res.send(content);
    });
  });
}

app.post('/callback/create-overlapping-intermediates', async function createOverlappingIntermediatesCallback(req, res) {
  // Start span 1 first.
  instana.sdk.callback.startIntermediateSpan('intermediate1', async span1 => {
    await delay(200);

    // Now start a second span (which is a child of the first).
    instana.sdk.callback.startIntermediateSpan('intermediate2', async () => {
      await delay(200);

      // Complete the first span while the second span is still ongoing, and while we are in the/ context of the second
      // span. To achieve this, the completeIntermediateSpan call receives an additional argument, which denotes the
      // span we want to complete.
      instana.sdk.callback.completeIntermediateSpan(null, { success: true }, span1);

      await delay(200);

      // We do not need to provide the extra span argument here because we are in the context of the second span, which
      // we want to complete now.
      instana.sdk.callback.completeIntermediateSpan(null, { success: true });
    });
  });

  await delay(600);
  res.status(200).send();
});

app.post('/promise/create-overlapping-intermediates', function createOverlappingIntermediatesPromise(req, res) {
  let span1;
  let span2;

  // Start span 1 first.
  instana.sdk.promise
    .startIntermediateSpan('intermediate1')
    .then(s => {
      span1 = s;
    })
    .then(() => delay(200))

    // Now start a second span (which is a child of the first).
    .then(() => instana.sdk.promise.startIntermediateSpan('intermediate2'))
    .then(s => {
      span2 = s;
    })
    .then(() => delay(200))

    // Complete the first span while the second span is still ongoing, and while we are in the context of the second
    // span. To achieve this, the completeIntermediateSpan call receives an additional argument, which denotes the span
    // we want to complete.
    .then(() => instana.sdk.promise.completeIntermediateSpan(null, { success: true }, span1))
    .then(() => delay(200))

    // Now complete the second span.
    .then(() => instana.sdk.promise.completeIntermediateSpan(null, { success: true }, span2))

    .then(() => {
      res.status(200).send();
    });
});

app.post('/async/create-overlapping-intermediates', async function createOverlappingIntermediatesPromise(req, res) {
  // Start span 1 first.
  const span1 = await instana.sdk.async.startIntermediateSpan('intermediate1');
  await delay(200);

  // Now start a second span (which is a child of the first).
  await instana.sdk.async.startIntermediateSpan('intermediate2');
  await delay(200);

  // Complete the first span while the second span is still ongoing, and while we are in the context of the second span.
  // To achieve this, the completeIntermediateSpan call receives an additional argument, which denotes the span we want
  // to complete.
  instana.sdk.async.completeIntermediateSpan(null, { success: true }, span1);
  await delay(200);

  // We do not need to provide the extra span argument here because the second span (which we want to complete now) is
  // the active span in this context..
  instana.sdk.async.completeIntermediateSpan(null, { success: true });

  res.status(200).send();
});

app.post('/callback/create-exit', function createExitCallback(req, res) {
  const file = getFile(req);
  const encoding = 'UTF-8';
  instana.sdk.callback.startExitSpan(
    'file-access',
    Object.freeze({
      path: file,
      encoding
    }),
    () => {
      afterCreateExit(instana.sdk.callback, file, encoding, res);
    }
  );
});

app.post('/promise/create-exit', function createExitPromise(req, res) {
  const file = getFile(req);
  const encoding = 'UTF-8';
  instana.sdk.promise
    .startExitSpan('file-access', {
      path: file,
      encoding
    })
    .then(() => {
      afterCreateExit(instana.sdk.promise, file, encoding, res);
    });
});

app.post('/async/create-exit', async function createExitAsync(req, res) {
  const file = getFile(req);
  const encoding = 'UTF-8';
  await instana.sdk.async.startExitSpan('file-access', {
    path: file,
    encoding
  });
  afterCreateExit(instana.sdk.async, file, encoding, res);
});

function afterCreateExit(instanaSdk, file, encoding, res) {
  fs.readFile(file, encoding, (err, content) => {
    if (err) {
      instanaSdk.completeExitSpan(err, { error: err.message });
      if (err.code === 'ENOENT') {
        return fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => res.sendStatus(404));
      }
      return res.status(500).send(err);
    }
    instanaSdk.completeExitSpan(null, { success: true });
    // follow-up with an IO action that is auto-traced to validate tracing context integrity
    fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
      res.send(content);
    });
  });
}

app.post('/callback/create-exit-synchronous-result', function createExitCallback(req, res) {
  const result = instana.sdk.callback.startExitSpan('synchronous-exit', () => {
    instana.sdk.callback.completeExitSpan(null, { success: true });
    return 42;
  });
  // follow-up with an IO action that is auto-traced to validate tracing context integrity
  fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
    res.send({ result });
  });
});

function getFile(req) {
  return req.query.error
    ? path.resolve(__dirname, '../../../does-not-exist')
    : path.resolve(__dirname, '../../../LICENSE');
}

function createSpansWithEventEmitter(message) {
  if (!message.type) {
    return process.send(`error: command event-emitter needs a type attribute: ${JSON.stringify(message)}`);
  }
  switch (message.type) {
    case 'callback':
      createEntryWithEventEmitterCallback(message);
      break;
    case 'promise':
      createEntryWithEventEmitterPromise(message);
      break;
    case 'async':
      createEntryWithEventEmitterAsync(message);
      break;
    default:
      process.send(`error: unknown command type: ${message.type}`);
  }
}

function createEntryWithEventEmitterCallback(message) {
  const emitter = new DummyEmitter();
  emitter.start();
  instana.sdk.callback.startEntrySpan('custom-entry', () => {
    setCorrelationAttributesForIpcMessage(message);
    onEmittedEvent(instana.sdk.callback, emitter, message);
  });
}

function createEntryWithEventEmitterPromise(message) {
  const emitter = new DummyEmitter();
  emitter.start();
  instana.sdk.promise.startEntrySpan('custom-entry').then(() => {
    setCorrelationAttributesForIpcMessage(message);
    onEmittedEvent(instana.sdk.promise, emitter, message);
  });
}

async function createEntryWithEventEmitterAsync(message) {
  const emitter = new DummyEmitter();
  emitter.start();
  await instana.sdk.async.startEntrySpan('custom-entry');
  setCorrelationAttributesForIpcMessage(message);
  onEmittedEvent(instana.sdk.async, emitter, message);
}

function onEmittedEvent(instanaSdk, emitter, message) {
  let receivedTicks = 0;
  instanaSdk.bindEmitter(emitter);
  emitter.on('tick', () => {
    if (receivedTicks++ === 5) {
      emitter.stop();
      fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
        instanaSdk.completeEntrySpan();
        process.send(`done: ${message.command}`);
      });
    }
  });
}

function nestEntryExit(message) {
  if (!message.type) {
    return process.send(`error: command nest-entry-exit needs a type attribute: ${JSON.stringify(message)}`);
  }
  switch (message.type) {
    case 'callback':
      nestEntryExitCallback(message);
      break;
    case 'promise':
      nestEntryExitPromise(message);
      break;
    case 'async':
      nestEntryExitAsync(message);
      break;
    default:
      process.send(`error: unknown command type: ${message.type}`);
  }
}

function nestEntryExitCallback(message) {
  instana.sdk.callback.startEntrySpan('custom-entry', () => {
    setCorrelationAttributesForIpcMessage(message);
    setTimeout(function createExit() {
      instana.sdk.callback.startExitSpan('custom-exit', () => {
        setTimeout(() => {
          // It might be a little surprising that this actually works - we complete the exit span and then immediately
          // and synchronously (that is, in the same async context) complete its parent span, the entry span.
          // Completing the entry span will only work if it is the currently active span. How does the entry span
          // become the active span when the exit span is completed? This is handled by clsHooked - when we start a new
          // span, we wrap this in cls.ns.runAndReturn or cls.ns.runPromise. Those will create a new _context_ in
          // clsHooked. All clsHooked context objects are created by inheriting prototypical from their parent context
          // (basically Object.create(this.active)). By completing the exit span we trigger its cleanup functions (see
          // packages/core/src/tracing/cls.js). One of these is the `unset` function returned by cls.ns.set
          // (added as a cleanup function in cls.startSpan). This unset function will delete the 'com.instana.span' key
          // from the active context. The next time we access the 'com.instana.span' attribute on that (now more or
          // less empty) context, its parent context's 'com.instana.span' value will be used (due to prototypical
          // inheritance).
          instana.sdk.callback.completeExitSpan();
          instana.sdk.callback.completeEntrySpan();
          process.send(`done: ${message.command}`);
        }, 50);
      });
    }, 50);
  });
}

function nestEntryExitPromise(message) {
  instana.sdk.promise
    .startEntrySpan('custom-entry')
    .then(() => setCorrelationAttributesForIpcMessage(message))
    .then(() => delay(50))
    .then(function createExit() {
      return instana.sdk.promise
        .startExitSpan('custom-exit')
        .then(() => delay(50))
        .then(() => {
          instana.sdk.promise.completeExitSpan();
        });
    })
    .then(() => {
      instana.sdk.promise.completeEntrySpan();
      process.send(`done: ${message.command}`);
    });
}

async function nestEntryExitAsync(message) {
  await instana.sdk.async.startEntrySpan('custom-entry');
  setCorrelationAttributesForIpcMessage(message);
  await delay(50);
  await instana.sdk.async.startExitSpan('custom-exit');
  await delay(50);
  instana.sdk.async.completeExitSpan();
  await instana.sdk.async.completeEntrySpan();
  process.send(`done: ${message.command}`);
}

function nestIntermediates(message) {
  if (!message.type) {
    return process.send(`error: command nest-intermediates needs a type attribute: ${JSON.stringify(message)}`);
  }
  switch (message.type) {
    case 'callback':
      nestIntermediatesCallback(message);
      break;
    case 'promise':
      nestIntermediatesPromise(message);
      break;
    case 'async':
      nestIntermediatesAsync(message);
      break;
    default:
      process.send(`error: unknown command type: ${message.type}`);
  }
}

function nestIntermediatesCallback(message) {
  instana.sdk.callback.startEntrySpan('custom-entry', () => {
    setCorrelationAttributesForIpcMessage(message);
    setTimeout(function createIntermediate1() {
      instana.sdk.callback.startIntermediateSpan('intermediate-1', () => {
        setTimeout(function createIntermediate2() {
          instana.sdk.callback.startIntermediateSpan('intermediate-2', () => {
            setTimeout(function createExit() {
              instana.sdk.callback.startExitSpan('custom-exit', () => {
                setTimeout(() => {
                  instana.sdk.callback.completeExitSpan();
                  instana.sdk.callback.completeIntermediateSpan();
                  instana.sdk.callback.completeIntermediateSpan();
                  instana.sdk.callback.completeEntrySpan();
                  process.send(`done: ${message.command}`);
                }, 50);
              });
            }, 50);
          });
        }, 50);
      });
    }, 50);
  });
}

function nestIntermediatesPromise(message) {
  instana.sdk.promise
    .startEntrySpan('custom-entry')
    .then(() => setCorrelationAttributesForIpcMessage(message))
    .then(() => delay(50))
    .then(function createIntermediate1() {
      instana.sdk.promise
        .startIntermediateSpan('intermediate-1')
        .then(() => delay(50))
        .then(function createIntermediate2() {
          instana.sdk.promise
            .startIntermediateSpan('intermediate-2')
            .then(() => delay(50))
            .then(function createExit() {
              instana.sdk.promise
                .startExitSpan('custom-exit')
                .then(() => delay(50))
                .then(() => {
                  instana.sdk.promise.completeExitSpan();
                  instana.sdk.promise.completeIntermediateSpan();
                  instana.sdk.promise.completeIntermediateSpan();
                  instana.sdk.promise.completeEntrySpan();
                  process.send(`done: ${message.command}`);
                });
            });
        });
    });
}

async function nestIntermediatesAsync(message) {
  await instana.sdk.async.startEntrySpan('custom-entry');
  setCorrelationAttributesForIpcMessage(message);
  await delay(50);
  await instana.sdk.async.startIntermediateSpan('intermediate-1');
  await delay(50);
  await instana.sdk.async.startIntermediateSpan('intermediate-2');
  await delay(50);
  instana.sdk.async.startExitSpan('custom-exit');
  await delay(50);
  instana.sdk.async.completeExitSpan();
  instana.sdk.async.completeIntermediateSpan();
  instana.sdk.async.completeIntermediateSpan();
  instana.sdk.async.completeEntrySpan();
  process.send(`done: ${message.command}`);
}

function synchronousOperations(message) {
  const result = instana.sdk.callback.startEntrySpan('synchronous-entry', () => {
    setCorrelationAttributesForIpcMessage(message);
    return instana.sdk.callback.startIntermediateSpan('synchronous-intermediate', () =>
      instana.sdk.callback.startExitSpan('synchronous-exit', () => {
        instana.sdk.callback.completeExitSpan();
        instana.sdk.callback.completeIntermediateSpan();
        instana.sdk.callback.completeEntrySpan();
        return '4711';
      })
    );
  });
  process.send(`done: ${result}`);
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
