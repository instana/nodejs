/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable consistent-return */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const morgan = require('morgan');
const path = require('path');
const pino = require('pino')();

const { sendToParent } = require('@_local/core/test/test_util');
const deepMerge = require('@_local/core/src/util/deepMerge');

const logPrefix = 'backend-stub';
const logger = pino.child({ name: logPrefix, pid: process.pid });
logger.level = process.env.INSTANA_DEBUG ? 'debug' : process.env.INSTANA_LOG_LEVEL || 'info';
const useHttps = process.env.BACKEND_USES_HTTPS !== 'false';

const options = {
  key: fs.readFileSync(path.join(__dirname, 'cert/server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'cert/server.crt'))
};

const port = process.env.BACKEND_PORT;
let unresponsive = process.env.BACKEND_UNRESPONSIVE === 'true';

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

// This endpoint will be called when the Lambda integration test simulates talking directly to serverless-acceptor
// instead of the Lambda extenstion (default case).
app.post('/serverless/bundle', acceptBundle);

function acceptBundle(req, res) {
  logger.info('POST /serverless/bundle');
  logger.debug(`Received ${req.body.spans.length}`);

  receivedData.rawBundles.push(req.body);
  if (unresponsive) {
    // intentionally not responding for tests that verify proper timeout handling
    return;
  }
  if (req.body.metrics && typeof req.body.metrics !== 'object') {
    return res.status(400).send({ error: 'The metrics value in the payload is no object.' });
  }
  if (req.body.metrics && Array.isArray(req.body.metrics)) {
    return res.status(400).send({ error: 'The metrics value in the payload is an array.' });
  }
  if (req.body.spans && !Array.isArray(req.body.spans)) {
    return res.status(400).send({ error: 'The spans value in the payload is no array.' });
  }
  if (!dropAllData) {
    if (req.body.metrics) {
      receivedData.metrics.push(addHeaders(req, req.body.metrics));
      aggregateMetrics(req.body.metrics);
    }
    if (req.body.spans) {
      receivedData.spans = receivedData.spans.concat(addHeaders(req, req.body.spans));
    }
  }
  return res.sendStatus(201);
}

// This endpoint will be called when the Lambda integration test simulates talking directly to serverless-acceptor
// instead of the Lambda extenstion (default case).
app.post('/serverless/metrics', acceptMetrics);

// This endpoint will be called when the Lambda integration test simulates talking to the Lambda extension instead of
// serverless-acceptor.
app.post('/metrics', acceptMetrics);

function acceptMetrics(req, res) {
  logger.info('POST /metrics');
  logger.debug(req.body);

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
    aggregateMetrics(req.body);
  }
  return res.sendStatus(201);
}

// This endpoint will be called when the Lambda integration test simulates talking directly to serverless-acceptor
// instead of the Lambda extenstion (default case).
app.post('/serverless/traces', acceptTraces);

// This endpoint will be called when the Lambda integration test simulates talking to the Lambda extension instead of
// serverless-acceptor.
app.post('/traces', acceptTraces);

function acceptTraces(req, res) {
  logger.info('POST /traces');
  logger.debug(`Received ${req.body.length} spans`);

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
}

app.post('/serverless/responsive', (req, res) => {
  unresponsive = req.query.responsive !== 'true';
  return res.sendStatus(204);
});

app.get('/serverless/received', (req, res) => res.json(receivedData));

app.delete('/serverless/received', (req, res) => {
  receivedData = resetReceivedData();
  return res.sendStatus(204);
});

app.get('/serverless/received/metrics', (req, res) => res.json(receivedData.metrics));

app.get('/serverless/received/aggregated/metrics', (req, res) => res.json(receivedData.aggregatedMetrics));

app.delete('/serverless/received/metrics', (req, res) => {
  receivedData.metrics = [];
  receivedData.aggregatedMetrics = [];
  return res.sendStatus('204');
});

app.get('/serverless/received/spans', (req, res) => res.json(receivedData.spans));

app.delete('/serverless/received/spans', (req, res) => {
  receivedData.spans = [];
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

if (useHttps) {
  https.createServer(options, app).listen(port, error => {
    if (error) {
      logger.error(error);
      return process.exit(1);
    } else {
      logger.info('Listening on port: %s (HTTPS)', port);
      sendToParent('backend: started');
    }
  });
} else {
  http.createServer(app).listen(port, error => {
    if (error) {
      logger.error(error);
      return process.exit(1);
    } else {
      logger.info('Listening on port: %s (HTTP)', port);
      sendToParent('backend: started');
    }
  });
}

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

function aggregateMetrics(newMetrics) {
  if (receivedData.aggregatedMetrics.length === 0) {
    receivedData.aggregatedMetrics = newMetrics.plugins;
  } else {
    newMetrics.plugins.forEach(snapshotUpdate => {
      const existingSnapshot = receivedData.aggregatedMetrics.find(
        snapshot => snapshotUpdate.name === snapshot.name && snapshotUpdate.entityId === snapshot.entityId
      );
      if (!existingSnapshot) {
        receivedData.aggregatedMetrics.push(snapshotUpdate);
      } else {
        deepMerge(existingSnapshot, snapshotUpdate);
      }
    });
  }
}

function resetReceivedData() {
  return {
    metrics: [],
    aggregatedMetrics: [],
    spans: [],
    rawBundles: [],
    rawMetrics: [],
    rawSpanArrays: []
  };
}
