/* eslint-disable no-console */

'use strict';

const agentPort = process.env.AGENT_PORT;

const instana = require('../../../..');
instana({
  agentPort,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1
  }
});

const request = require('request-promise');
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const winston = require('winston');
winston.add(new winston.transports.Console({ level: 'info' }));

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console({ level: 'info' })]
});

const app = express();
const logPrefix = `Express / Winston App (${process.pid}):\t`;

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
  let args = [];

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
    args.push({ level: level, message: 'the message' });
  } else {
    throw new Error(`unknown variant: ${variant}`);
  }

  method.apply(context, args);
  finish(res);
});

function finish(res) {
  request(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
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
