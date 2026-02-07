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

if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('src/immediate')) {
  require('@instana/collector')();
}

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const pino = require('pino');
const port = require('@_local/collector/test/test_util/app-port')();
const agentPort = process.env.INSTANA_AGENT_PORT;
const pinoOptions = {
  customLevels: {
    customInfo: 31,
    customError: 51
  }
};

// NOTE: This is the same pino instance as in the uninstrumentedLogger.js!
//       We already test against multiple pino versions. If we test with pino-v8,
//       this loads a different npm pino version into the cache.
const plainVanillaPino = pino(pinoOptions);
let expressPino;

// requiring pino-http creates a false positive test, because this pino version is not in the node cache yet.
if (process.env.PINO_EXPRESS === 'true') {
  expressPino = require('pino-http')(pinoOptions);
}

const app = express();
const logPrefix = `Pino App with pino-http: ${process.env.PINO_EXPRESS} (${process.pid}):\t`;

let secondPinoVersion;
if (process.env.PINO_SECOND_VERSION === 'true') {
  const pinoSecondVersion = require('./lib/load-pino');
  secondPinoVersion = pinoSecondVersion(pinoOptions);
  log('Loaded second pino version.');
}

let secondPinoInstance;
if (process.env.PINO_SECOND_INSTANCE === 'true') {
  const secondRequire = require('pino');
  secondPinoInstance = secondRequire(pinoOptions);

  log('Loaded second pino instance');
}

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

if (process.env.PINO_EXPRESS === 'true') {
  app.use(expressPino);
}

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

  if (process.env.PINO_SECOND_VERSION === 'true') {
    secondPinoVersion.error('Error from second pino version - should be traced.');
  }

  if (process.env.PINO_SECOND_INSTANCE === 'true') {
    secondPinoInstance.error('Error from second pino instance - should be traced.');
  }

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

app.get('/thread-stream-test', (req, res) => {
  try {
    const mode = process.env.PINO_WORKER_MODE || 'transport';

    const logger =
      mode === 'transport'
        ? pino({ transport: { target: 'pino-pretty', options: { destination: 1 } } })
        : pino({ destination: 1 });
    logger.error('Pino worker test error log');

    res.sendStatus(200);
  } catch (e) {
    res.status(500).send(`Failed: ${e.message}`);
  }
});

function finish(res) {
  fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
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
