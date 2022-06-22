/*
 * (c) Copyright IBM Corp. 2022
 */

/* eslint-disable consistent-return */

'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const pino = require('pino')();
const http = require('http');
const https = require('http');
const { sendToParent } = require('../../../core/test/test_util');
const logPrefix = 'extension-stub';
const logger = pino.child({ name: logPrefix, pid: process.pid });
logger.level = 'info';

const port = process.env.EXTENSION_PORT;
const unresponsive = process.env.EXTENSION_UNRESPONSIVE === 'true';

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix} (${process.pid}): :method :url :status`));
}

app.use(
  bodyParser.json({
    limit: '10mb'
  })
);

// This endpoint will be called when the Lambda integration test simulates talking to the Lambda extension instead of
// serverless-acceptor.
app.post('/bundle', acceptBundle);

function acceptBundle(req, res) {
  logger.debug('incoming bundle', req.body);

  const stringifiedBody = JSON.stringify(req.body);

  if (unresponsive) {
    // intentionally not responding for tests that verify proper timeout handling
    return;
  }

  const transport = process.env.BACKEND_HTTPS === 'true' ? https : http;
  const options = {
    hostname: 'localhost',
    port: process.env.BACKEND_PORT,
    path: '/serverless/bundle',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(stringifiedBody),
      ...req.headers
    }
  };

  const beReq = transport.request(options);
  beReq.end(stringifiedBody);
  return res.sendStatus(201);
}

http.createServer(app).listen(port, error => {
  if (error) {
    logger.error(error);
    return process.exit(1);
  } else {
    logger.info('Listening on port: %s (HTTP)', port);
    sendToParent('extension: started');
  }
});
