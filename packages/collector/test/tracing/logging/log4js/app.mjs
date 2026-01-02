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

import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';
import log4js from 'log4js';
import getAppPort from '../../../test_util/app-port.js';
const port = getAppPort();

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
  const multipleArguments = query.multipleArguments === 'true';

  let method = null;
  const args = [];

  if (useLogMethod) {
    method = logger.log;
    args.push(level);
  } else {
    method = logger[level];
  }

  if (multipleArguments) {
    args.push(message, 'more', 'arguments');
  } else {
    args.push(message);
  }

  method.apply(logger, args);
  finish(res);
});

function finish(res) {
  fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
    res.sendStatus(201);
  });
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
