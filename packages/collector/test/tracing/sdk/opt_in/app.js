/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const instana = require('../../../..')({
  tracing: {
    allowRootExitSpan: true
  }
});

const url = 'https://www.instana.com';

const bodyParser = require('body-parser');
const express = require('express');
const fetch = require('node-fetch-v2');
const port = require('../../../test_util/app-port')();
const { getLogger } = require('../../../../../core/test/test_util');

const app = express();
const logPrefix = `OPT_IN: Server (${process.pid}):\t`;
const log = getLogger(logPrefix);

app.use(bodyParser.json());

app.use((req, res, next) => {
  next();
});

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/no-sdk-wrap', (req, res) => {
  setTimeout(() => {
    fetch(url).then(result => {
      res.send({ result });
    });
  }, 100);
});

app.get('/sdk-wrap', (req, res) => {
  setTimeout(() => {
    instana.sdk.promise
      .startEntrySpan('test-timeout-span')
      .then(() => {
        try {
          fetch(url).then(result => {
            res.send({ result });
          });
        } catch (error) {
          log(error);
        } finally {
          instana.sdk.promise.completeEntrySpan();
        }
      })
      .catch(err => {
        instana.sdk.promise.completeEntrySpan(err);
        log('Error starting test-timeout-span:', err);
      });
  }, 100);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
