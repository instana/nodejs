/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import bodyParser from 'body-parser';
import express from 'express';
import moduleModule from 'module';
import morgan from 'morgan';
import semver from 'semver';
import expressWinston from 'express-winston';
import { createRequire } from 'module';
import getAppPort from '../../../test_util/app-port.js';
const port = getAppPort();

const require = createRequire(import.meta.url);
const expressWinstonLocation = require.resolve('express-winston');
const winston = moduleModule.createRequire(expressWinstonLocation)('winston');

const app = express();
const logPrefix = `express-winston app (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.use(
  expressWinston.logger({
    transports: [new winston.transports.Console()],
    statusLevels: true
  })
);

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/200', (req, res) => {
  res.sendStatus(200);
});

app.get('/400', (req, res) => {
  res.sendStatus(400);
});

app.get('/500', (req, res) => {
  res.sendStatus(500);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
