/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

if (!process.env.NODE_OPTIONS || !process.env.NODE_OPTIONS.includes('src/immediate')) {
  require('@instana/collector')();
}

const express = require('express');
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const port = require('@_local/collector/test/test_util/app-port')();
const { getTestAppLogger: getLogger } = require('@_local/core/test/test_util');

const app = express();
const logPrefix = `Worker Thread ParentPort Messages App (${process.pid}):\t`;
const log = getLogger(logPrefix);

let worker = null;
const receivedMessages = [];

function createWorker() {
  worker = new Worker(path.join(__dirname, 'worker.js'));

  worker.on('message', msg => {
    log(`Received message from worker: ${JSON.stringify(msg)}`);
    receivedMessages.push(msg);
  });

  worker.on('error', err => {
    log(`Worker error: ${err.message}`);
  });

  worker.on('exit', code => {
    log(`Worker exited with code ${code}`);
  });
}

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/create-worker', (req, res) => {
  if (worker) {
    worker.terminate();
  }
  createWorker();
  res.json({ success: true });
});

app.get('/generate-pdf', (req, res) => {
  const filename = req.query.filename || 'test.pdf';

  if (!worker) {
    createWorker();
  }

  worker.postMessage({
    action: 'generate',
    filename: filename
  });

  setTimeout(() => {
    res.json({
      success: true,
      filename: filename
    });
  }, 200);
});

app.get('/received-messages', (req, res) => {
  res.json({
    messages: receivedMessages,
    count: receivedMessages.length
  });
});

app.get('/check-messages', (req, res) => {
  const instanaMessages = receivedMessages.filter(msg => msg === 'instana.collector.initialized');

  const appMessages = receivedMessages.filter(
    msg => msg && typeof msg === 'object' && (msg.fileName || msg.type === 'worker-ready')
  );

  res.json({
    hasUnexpectedMessages: instanaMessages.length > 0,
    instanaMessageCount: instanaMessages.length,
    appMessageCount: appMessages.length,
    allMessages: receivedMessages
  });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
