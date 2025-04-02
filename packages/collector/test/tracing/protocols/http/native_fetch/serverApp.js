/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const logPrefix = `Native Fetch Server (${process.pid}):\t`;

const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

const app = express();
const port = require('../../../../test_util/app-port')();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.all('/fetch', (req, res) => {
  if (req.query.headersInResponse) {
    res.setHeader('X-MY-EXIT-RESPONSE-HEADER', 'x-my-exit-response-header-value');
  }
  res.setHeader('x-my-exit-response-not-captured-header', 'something');
  if (req.query.withServerError) {
    res.status(500);
  } else {
    res.status(200);
  }

  if (!req.query.withTimeout) {
    res.json({
      method: req.method,
      headers: req.headers
    });
  }
});

app.listen(port, () => {
  log(`Listening on port ${port}.`);
});
