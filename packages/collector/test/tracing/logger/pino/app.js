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

require('./mockVersion');
require('../../../..')();

const fetch = require('node-fetch-v2');
const bodyParser = require('body-parser');
require('@instana/core/test/test_util/mockRequireExpress');
const express = require('express');
const morgan = require('morgan');
const pino = require('pino');
const port = require('../../../test_util/app-port')();
const agentPort = process.env.INSTANA_AGENT_PORT;
const pinoOptions = {
  customLevels: {
    customInfo: 31,
    customError: 51
  }
};

const plainVanillaPino = pino(pinoOptions);
const expressPino = require('pino-http')(pinoOptions);

const app = express();
const logPrefix = `Pino App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(expressPino);

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/info', (req, res) => {
  plainVanillaPino.info('Info message - must not be traced.');
  finish(res);
});

app.get('/warn', (req, res) => {
  plainVanillaPino.warn('Warn message - should be traced.');
  finish(res);
});

app.get('/error', (req, res) => {
  plainVanillaPino.error('Error message - should be traced.');
  finish(res);
});

app.get('/fatal', (req, res) => {
  plainVanillaPino.fatal('Fatal message - should be traced.');
  finish(res);
});

app.get('/custom-info', (req, res) => {
  plainVanillaPino.customInfo('Custom info level message - should not be traced.');
  finish(res);
});

app.get('/custom-error', (req, res) => {
  plainVanillaPino.customError('Custom error level message - should be traced.');
  finish(res);
});

app.get('/error-object-only', (req, res) => {
  plainVanillaPino.error(new Error('This is an error.'));
  finish(res);
});

app.get('/error-random-object-only', (req, res) => {
  plainVanillaPino.error({
    payload: {
      statusCode: 404,
      error: 'Not Found',
      very: {
        deeply: {
          nested: {
            data: 'that we will not serialize'
          }
        }
      }
    }
  });
  finish(res);
});

app.get('/error-object-and-string', (req, res) => {
  plainVanillaPino.error(new Error('This is an error.'), 'Error message - should be traced.');
  finish(res);
});

app.get('/error-random-object-and-string', (req, res) => {
  plainVanillaPino.error({ foo: { bar: 'baz' } }, 'Error message - should be traced.');
  finish(res);
});

app.get('/child-error', (req, res) => {
  const child = plainVanillaPino.child({ a: 'property' });
  child.error('Child logger error message - should be traced.');
  finish(res);
});

app.get('/express-pino-info', (req, res) => {
  req.log.info('Info message - must not be traced.');
  finish(res);
});

app.get('/express-pino-warn', (req, res) => {
  req.log.warn('Warn message - should be traced.');
  finish(res);
});

app.get('/express-pino-error', (req, res) => {
  req.log.error('Error message - should be traced.');
  finish(res);
});

app.get('/express-pino-fatal', (req, res) => {
  req.log.fatal('Fatal message - should be traced.');
  finish(res);
});

app.get('/express-pino-custom-info', (req, res) => {
  req.log.customInfo('Custom info level message - should not be traced.');
  finish(res);
});

app.get('/express-pino-custom-error', (req, res) => {
  req.log.customError('Custom error level message - should be traced.');
  finish(res);
});

app.get('/express-pino-error-object-only', (req, res) => {
  req.log.error(new Error('This is an error.'));
  finish(res);
});

app.get('/express-pino-error-random-object-only', (req, res) => {
  req.log.error({
    payload: {
      statusCode: 404,
      error: 'Not Found',
      very: {
        deeply: {
          nested: {
            data: 'that we will not serialize'
          }
        }
      }
    }
  });
  finish(res);
});

app.get('/express-pino-error-object-and-string', (req, res) => {
  req.log.error(new Error('This is an error.'), 'Error message - should be traced.');
  finish(res);
});

app.get('/express-pino-error-random-object-and-string', (req, res) => {
  req.log.error({ foo: { bar: 'baz' } }, 'Error message - should be traced.');
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
