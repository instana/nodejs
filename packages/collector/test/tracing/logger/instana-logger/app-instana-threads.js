/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/load_express_v4');

const path = require('path');
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const { Worker } = require('worker_threads');

const port = require('../../../test_util/app-port')();
const app = express();
const logPrefix = `Instana threads app (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

function runWorker() {
  const worker = new Worker(path.join(__dirname, 'worker.js'), {
    workerData: {
      agentPort: process.env.INSTANA_AGENT_PORT
    }
  });

  worker.on('message', message => {
    if (message === 'instana.collector.initialized') {
      process.send('instana.collector.initialized');
    }
  });
}

runWorker();

app.get('/', (req, res) => {
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
