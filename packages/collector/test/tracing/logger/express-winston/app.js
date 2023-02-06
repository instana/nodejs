/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const moduleModule = require('module');
const morgan = require('morgan');
const semver = require('semver');
const expressWinston = require('express-winston');
const port = require('../../../test_util/app-port')();
let winston1x;

const expressWinstonLocation = require.resolve('express-winston');
if (semver.satisfies(process.version, '>=12.2.0')) {
  // Use require.resolve and createRequire to get the winston dependency of express-winston (which is Winston 1.x) and
  // not the Winston version we depend on via our root package's devDependencies (which is 3.x):
  winston1x = moduleModule.createRequire(expressWinstonLocation)('winston');
} else {
  // Same as above, but use createRequireFromPath instead of createRequire.
  winston1x = moduleModule.createRequireFromPath(expressWinstonLocation)('winston');
}

const app = express();
const logPrefix = `express-winston app (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.use(
  expressWinston.logger({
    transports: [new winston1x.transports.Console()],
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
