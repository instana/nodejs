/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

/* eslint-disable no-console */

'use strict';

require('../../../..')();

const request = require('request-promise');
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const log4js = require('log4js');

const agentPort = process.env.INSTANA_AGENT_PORT;

log4js.configure({
  appenders: {
    out: { type: 'stdout' }
  },
  categories: {
    default: { appenders: ['out'], level: 'all' }
  }
});

const logger = log4js.getLogger();

const app = express();
const logPrefix = `Log4js App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.post('/log', (req, res) => {
  const query = req.query;
  const level = query.level;
  const message = query.message;
  const useLogMethod = query.useLogMethod === 'true';

  let method = null;
  const args = [];

  if (useLogMethod) {
    method = logger.log;
    args.push(level);
  } else {
    method = logger[level];
  }

  args.push(message);

  method.apply(logger, args);
  finish(res);
});

function finish(res) {
  request(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(201);
  });
}

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
