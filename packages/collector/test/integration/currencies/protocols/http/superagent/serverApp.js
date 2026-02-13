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

require('@instana/collector')();

const express = require('express');
const morgan = require('morgan');
const port = require('@_local/collector/test/test_util/app-port')();

const logPrefix = `Superagent Server (${process.pid}):\t`;
const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.get('/', (req, res) => res.sendStatus(200));

['/request-url-opts'].forEach(p => {
  app.get(p, (req, res) => {
    res.sendStatus(200);
  });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`${logPrefix}Listening on port: ${port}`);
});
