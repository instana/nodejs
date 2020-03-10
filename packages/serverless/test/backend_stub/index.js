/* eslint-disable consistent-return */

'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const https = require('https');
const morgan = require('morgan');
const path = require('path');
const pino = require('pino')();

const sendToParent = require('../util/send_to_parent');

const logPrefix = 'backend-stub';
const logger = pino.child({ name: logPrefix, pid: process.pid });
logger.level = 'info';

const options = {
  key: fs.readFileSync(path.join(__dirname, 'cert/server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'cert/server.crt'))
};

const port = process.env.BACKEND_PORT || 8443;
const unresponsive = process.env.BACKEND_UNRESPONSIVE === 'true';
const app = express();

const dropAllData = process.env.DROP_DATA === 'true';
let receivedData = resetReceivedData();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix} (${process.pid}): :method :url :status`));
}

app.use(
  bodyParser.json({
    limit: '10mb'
  })
);

app.post('/serverless/bundle', (req, res) => {
  logger.trace('incoming bundle', req.body);
  receivedData.rawBundles.push(req.body);
  if (unresponsive) {
    // intentionally not responding for tests that verify proper timeout handling
    return;
  }
  if (!req.body.metrics) {
    return res.status(400).send({ error: 'Payload has no metrics.' });
  }
  if (typeof req.body.metrics !== 'object') {
    return res.status(400).send({ error: 'The metrics value in the payload is no object.' });
  }
  if (Array.isArray(req.body.metrics)) {
    return res.status(400).send({ error: 'The metrics value in the payload is an array.' });
  }
  if (!req.body.spans) {
    return res.status(400).send({ error: 'Payload has no spans.' });
  }
  if (!Array.isArray(req.body.spans)) {
    return res.status(400).send({ error: 'The spans value in the payload is no array.' });
  }
  if (!dropAllData) {
    receivedData.metrics.push(addHeaders(req, req.body.metrics));
    receivedData.spans = receivedData.spans.concat(addHeaders(req, req.body.spans));
  }
  return res.sendStatus(201);
});

app.post('/serverless/metrics', (req, res) => {
  logger.debug('incoming metrics', req.body);
  receivedData.rawMetrics.push(req.body);
  if (unresponsive) {
    // intentionally not responding for tests that verify proper timeout handling
    return;
  }
  if (typeof req.body !== 'object') {
    return res.status(400).send({ error: 'The payload is no object.' });
  }
  if (Array.isArray(req.body)) {
    return res.status(400).send({ error: 'The payload is an array.' });
  }
  if (!dropAllData) {
    receivedData.metrics.push(addHeaders(req, req.body));
  }
  return res.sendStatus(201);
});

app.post('/serverless/traces', (req, res) => {
  logger.debug('incoming spans', req.body);
  receivedData.rawSpanArrays.push(req.body);
  if (unresponsive) {
    // intentionally not responding for tests that verify proper timeout handling
    return;
  }
  if (!Array.isArray(req.body)) {
    return res.status(400).send({ error: 'The payload is no array.' });
  }
  if (!dropAllData) {
    receivedData.spans = receivedData.spans.concat(addHeaders(req, req.body));
  }
  return res.sendStatus(201);
});

app.get('/serverless/received', (req, res) => res.json(receivedData));

app.delete('/received', (req, res) => {
  receivedData = resetReceivedData();
  return res.sendStatus(204);
});

app.get('/serverless/received/metrics', (req, res) => res.json(receivedData.metrics));

app.delete('/received/metrics', (req, res) => {
  receivedData.metrics = [];
  return res.sendStatus('204');
});

app.get('/serverless/received/spans', (req, res) => res.json(receivedData.spans));

app.delete('/serverless/received/spans', (req, res) => {
  receivedData.metrics = [];
  return res.sendStatus('204');
});

app.get('/serverless/received/raw/bundles', (req, res) => res.json(receivedData.rawBundles));

app.delete('/serverless/received/raw/bundles', (req, res) => {
  receivedData.rawBundles = [];
  return res.sendStatus('204');
});

app.get('/serverless/received/raw/metrics', (req, res) => res.json(receivedData.rawMetrics));

app.delete('/serverless/received/raw/metrics', (req, res) => {
  receivedData.rawMetrics = [];
  return res.sendStatus('204');
});

app.get('/serverless/received/raw/spanArrays', (req, res) => res.json(receivedData.rawSpanArrays));

app.delete('/serverless/received/raw/spanArrays', (req, res) => {
  receivedData.rawSpanArrays = [];
  return res.sendStatus('204');
});

https.createServer(options, app).listen(port, error => {
  if (error) {
    logger.error(error);
    return process.exit(1);
  } else {
    logger.info('Listening on port: %s', port);
    sendToParent('backend: started');
  }
});

function addHeaders(req, payload) {
  if (Array.isArray(payload)) {
    payload.forEach(elem => {
      elem._receivedHeaders = req.headers;
    });
  } else {
    payload._receivedHeaders = req.headers;
  }
  return payload;
}

function resetReceivedData() {
  return {
    metrics: [],
    spans: [],
    rawBundles: [],
    rawMetrics: [],
    rawSpanArrays: []
  };
}
