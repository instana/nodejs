'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const https = require('https');
const morgan = require('morgan');
const path = require('path');
const pino = require('pino')();

const sendToParent = require('../util/send_to_parent');

const logPrefix = 'acceptor-stub';
const logger = pino.child({ name: logPrefix, pid: process.pid });
logger.level = 'debug';

const options = {
  key: fs.readFileSync(path.join(__dirname, 'cert/server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'cert/server.crt'))
};

const port = process.env.ACCEPTOR_PORT || 8443;
const unresponsive = process.env.ACCEPTOR_UNRESPONSIVE === 'true';
const app = express();

const dropAllData = process.env.DROP_DATA === 'true';
const receivedData = resetReceivedData();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`acceptor-stub (${process.pid}): :method :url :status`));
}

app.use(
  bodyParser.json({
    limit: '10mb'
  })
);

app.get('/', (_, res) => {
  return res.sendStatus(200);
});

app.post('/bundle', (req, res) => {
  logger.trace('incoming bundle', req.body);
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
    receivedData.metrics.push(req.body.metrics);
    receivedData.spans = receivedData.spans.concat(req.body.spans);
  }
  return res.sendStatus(201);
});

app.post('/metrics', (req, res) => {
  logger.debug('incoming metrics', req.body);
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
    receivedData.metrics.push(req.body);
  }
  return res.sendStatus(201);
});

app.post('/spans', (req, res) => {
  logger.debug('incoming spans', req.body);
  if (unresponsive) {
    // intentionally not responding for tests that verify proper timeout handling
    return;
  }
  if (!Array.isArray(req.body)) {
    return res.status(400).send({ error: 'The payload is no array.' });
  }
  if (!dropAllData) {
    receivedData.spans = receivedData.spans.concat(req.body);
  }
  return res.sendStatus(201);
});

app.get('/received', function(req, res) {
  return res.json(receivedData);
});

app.delete('/received', function(req, res) {
  receivedData = resetReceivedData();
  return res.sendStatus(204);
});

app.get('/received/metrics', function(req, res) {
  return res.json(receivedData.metrics);
});

app.delete('/received/metrics', function(req, res) {
  receivedData.metrics = [];
  return res.sendStatus('204');
});

app.get('/received/spans', function(req, res) {
  return res.json(receivedData.spans);
});

app.delete('/received/spans', function(req, res) {
  receivedData.metrics = [];
  return res.sendStatus('204');
});

// TODO Using http2 (with TLS, of course) would be preferable over HTTPS 1.1.
https.createServer(options, app).listen(port, error => {
  if (error) {
    logger.error(error);
    return process.exit(1);
  } else {
    logger.info('Listening on port: %s', port);
    sendToParent('acceptor: started');
  }
});

function resetReceivedData() {
  return {
    metrics: [],
    spans: []
  };
}
