/*
 * (c) Copyright IBM Corp. 2024
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const agentPort = process.env.AGENT_PORT;
const createCustomLogSpans = process.env.CREATE_CUSTOM_LOG_SPANS === 'true';
const extendedLoggerConfig = process.env.EXTENDED_LOGGER_CONFIG === 'true';
const pinoExtendedFormat = require('@elastic/ecs-pino-format');

const instana = require('@instana/collector')({
  agentPort,
  // Supress any eary Instana logs when using extendedLoggerConfig because
  // of https://jsw.ibm.com/browse/INSTA-24679. These early logs are not useful for this extend config test.
  // TODO: Remove this condition as soon as you work on https://jsw.ibm.com/browse/INSTA-24679.
  level: extendedLoggerConfig ? 'error' : 'info',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1
  }
});

const pino = require('pino');

// We define a level during instantiation of Instana, but we override the level here with our custom logger.
// Some logs can still appear from level "info", because Instana is already operating.
// See https://jsw.ibm.com/browse/INSTA-24679
let pinoInstance;

if (extendedLoggerConfig) {
  // https://github.com/elastic/ecs-logging-nodejs/blob/v1.5.3/packages/ecs-pino-format/index.js#L114
  pinoInstance = pino(Object.assign({}, pinoExtendedFormat(), { level: 'debug' }));
} else {
  pinoInstance = pino({ name: 'app-logger', level: 'warn' });
}

instana.setLogger(pinoInstance);

const instanaLogger = require('@_instana/collector/src/logger').getLogger();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const port = require('@_instana/collector/test/test_util/app-port')();
const app = express();
const logPrefix = `Pino App [Instana receives Pino logger] (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/trigger', (req, res) => {
  instanaLogger.error('An error logged by Instana - this must not be traced');

  if (createCustomLogSpans) {
    pinoInstance.warn('A custom info log - this must be traced');
  }

  res.sendStatus(200);
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
