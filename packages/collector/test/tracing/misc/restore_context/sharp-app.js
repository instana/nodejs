'use strict';

const instana = require('../../../../')();

const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const morgan = require('morgan');
const path = require('path');
const pino = require('pino')();
const sharp = require('sharp');

const app = express();
const logPrefix = `Restore Context (${process.pid}):\t`;
const port = process.env.APP_PORT || 3222;

const imagePath = path.join(__dirname, 'instana.png');

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.post('/run', (req, res) => {
  fs.readFile(imagePath, (readErr, imgBuffer) => {
    if (readErr) {
      log(readErr);
      return res.sendStatus(500);
    }

    // 1. Fetch the currently active asynchronous context directly _before_ the asynchronous operation that breaks
    // async_hooks/async_wrap continuity.
    const activeContext1 = instana.sdk.getAsyncContext();

    const sharpObj = sharp(imgBuffer);
    sharpObj.metadata(metadataErr => {
      // 2. Restore the asynchronous context directly _after_ the asynchronous operation that breaks
      // async_hooks/async_wrap continuity and run subsequent  code in the callback of instana.sdk.runInAsyncContext.
      instana.sdk.runInAsyncContext(activeContext1, () => {
        if (metadataErr) {
          log(metadataErr);
          return res.sendStatus(500);
        }
        // 3. If multiple operations are performed which break async_hooks/async_wrap continuity, each operation must be
        // treated like this: fetch the currently active context...
        const activeContext2 = instana.sdk.getAsyncContext();
        sharpObj.toBuffer(toBufferErr => {
          // 4. ... and restore it afterwards.
          instana.sdk.runInAsyncContext(activeContext2, () => {
            if (toBufferErr) {
              log(toBufferErr);
              return res.sendStatus(500);
            }

            pino.warn('Should be traced.');
            return res.sendStatus(200);
          });
        });
      });
    });
  });
});

app.post('/run-promise', (req, res) => {
  fs.readFile(imagePath, (readErr, imgBuffer) => {
    if (readErr) {
      log(readErr);
      return res.sendStatus(500);
    }

    // 1. Fetch the currently active asynchronous context directly _before_ the asynchronous operation that breaks
    // async_hooks/async_wrap continuity.
    const activeContext1 = instana.sdk.getAsyncContext();

    const sharpObj = sharp(imgBuffer);
    sharpObj.metadata(metadataErr => {
      // 2. Restore the asynchronous context directly _after_ the asynchronous operation that breaks
      // async_hooks/async_wrap continuity and run subsequent code in the then-/catch-handlers of the promise returned
      // by instana.sdk.runPromiseInAsyncContext.
      instana.sdk
        .runPromiseInAsyncContext(activeContext1, createPromise.bind(null, metadataErr))
        .then(() => {
          // 3. If multiple operations are performed which break async_hooks/async_wrap continuity, each operation must
          // be treated like this: fetch the currently active context...
          const activeContext2 = instana.sdk.getAsyncContext();
          sharpObj.toBuffer(toBufferErr => {
            // 4. ... and restore it afterwards.
            instana.sdk
              .runPromiseInAsyncContext(activeContext2, createPromise.bind(null, toBufferErr))
              .then(() => {
                pino.warn('Should be traced.');
                return res.sendStatus(200);
              })
              .catch(err => {
                log(err);
                return res.sendStatus(500);
              });
          });
        })
        .catch(err => {
          log(JSON.stringify(err));
          return res.sendStatus(500);
        });
    });
  });
});

app.post('/enter-and-leave', (req, res) => {
  fs.readFile(imagePath, (readErr, imgBuffer) => {
    if (readErr) {
      log(readErr);
      return res.sendStatus(500);
    }

    // 1. Fetch the currently active asynchronous context directly _before_ the asynchronous operation that breaks
    // async_hooks/async_wrap continuity.
    const activeContext1 = instana.sdk.getAsyncContext();

    const sharpObj = sharp(imgBuffer);
    sharpObj.metadata(metadataErr => {
      // 2. Restore the asynchronous context directly _after_ the asynchronous operation that breaks
      // async_hooks/async_wrap continuity. NOTE: enterAsyncContext is not part of the offical @instana/collector SDK
      // API and its use is not recommended. Instead, use the SDK functions runInAsyncContext or
      // runPromiseInAsyncContext.
      instana.core.tracing.getCls().enterAsyncContext(activeContext1);

      if (metadataErr) {
        log(metadataErr);
        // If enterAsyncContext is used directly, leaving the context must also be taken care of manually.
        res.sendStatus(500);
        instana.core.tracing.getCls().leaveAsyncContext(activeContext1);
        return;
      }

      // Do the same (get async context, restore it) for every library call that breaks async_hooks continuity.
      const activeContext2 = instana.sdk.getAsyncContext();
      sharpObj.toBuffer(toBufferErr => {
        instana.core.tracing.getCls().enterAsyncContext(activeContext2);
        if (toBufferErr) {
          log(toBufferErr);
          // If enterAsyncContext is used directly, leaving the context must also be taken care of manually.
          res.sendStatus(500);
          instana.core.tracing.getCls().leaveAsyncContext(activeContext2);
          instana.core.tracing.getCls().leaveAsyncContext(activeContext1);
          return;
        }

        pino.warn('Should be traced.');
        // If enterAsyncContext is used directly, leaving the context must also be taken care of manually.
        res.sendStatus(200);
        instana.core.tracing.getCls().leaveAsyncContext(activeContext2);
        instana.core.tracing.getCls().leaveAsyncContext(activeContext1);
        // eslint-disable-next-line no-useless-return
        return;
      });
    });
  });
});

function createPromise(err) {
  return new Promise((resolve, reject) => {
    if (err) {
      reject(err);
    } else {
      resolve();
    }
  });
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
