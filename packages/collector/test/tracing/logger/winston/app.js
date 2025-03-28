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

require('../../../..')();

const fetch = require('node-fetch-v2');
const bodyParser = require('body-parser');
require('@instana/core/test/test_util/mockRequireExpress');
const express = require('express');
const morgan = require('morgan');
const semver = require('semver');
const winston = require('winston');
const port = require('../../../test_util/app-port')();
const agentPort = process.env.INSTANA_AGENT_PORT;

let logger;
if (winston.version && semver.lt(winston.version, '3.0.0')) {
  // either use Winston's default logger or create a new one
  logger = new winston.Logger();
} else if (winston.version && semver.gte(winston.version, '3.0.0')) {
  // Winston >= 3.x
  winston.add(new winston.transports.Console({ level: 'info' }));
  logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [new winston.transports.Console({ level: 'info' })]
  });
} else {
  throw new Error(`You are running an unknown version of Winston: ${winston.version}`);
}

const app = express();
const logPrefix = `Winston App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/log', (req, res) => {
  const query = req.query;
  const level = query.level;
  const variant = query.variant;
  const useGlobalLogger = query.useGlobalLogger === 'true';
  const useLevelMethod = query.useLevelMethod === 'true';

  let context = null;
  let method = null;
  const args = [];

  if (useGlobalLogger) {
    context = winston;
  } else {
    context = logger;
  }

  if (useLevelMethod) {
    if (variant === 'object-with-level') {
      throw new Error('illegal combination of useLevelMethod: true and variant: object-with-level');
    }
    if (level === 'info') {
      method = context.info;
    } else if (level === 'warn') {
      method = context.warn;
    } else if (level === 'error') {
      method = context.error;
    } else {
      throw new Error(`unknown level: ${level}`);
    }
  } else {
    method = context.log;
    if (variant !== 'object-with-level') {
      if (level === 'info') {
        args.push('info');
      } else if (level === 'warn') {
        args.push('warn');
      } else if (level === 'error') {
        args.push('error');
      } else {
        throw new Error(`unknown level: ${level}`);
      }
    }
  }

  if (variant === 'string-only') {
    args.push('the message');
  } else if (variant === 'string-plus-additional-message') {
    args.push('the message');
    args.push({ message: '+additional message' });
  } else if (variant === 'string-substitution') {
    args.push('the message %s');
    args.push('replacement');
  } else if (variant === 'object-with-message') {
    args.push({ message: 'the message' });
  } else if (variant === 'object-with-level') {
    args.push({ level, message: 'the message' });
  } else {
    throw new Error(`unknown variant: ${variant}`);
  }

  method.apply(context, args);
  finish(res);
});

function finish(res) {
  fetch(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
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
