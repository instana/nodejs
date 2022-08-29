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
logger.level = process.env.INSTANA_DEBUG ? 'debug' : process.env.INSTANA_LOG_LEVEL || 'info';

const port = process.env.EXTENSION_PORT;

const unresponsive = process.env.EXTENSION_UNRESPONSIVE === 'true';
const preflightResponsiveButUnresponsiveLater =
  process.env.EXTENSION_PREFFLIGHT_RESPONSIVE_BUT_UNRESPONSIVE_LATER === 'true';
const preflightRespondsWithUnexpectedStatusCode =
  process.env.PREFLIGHT_REQUEST_RESPONDS_WITH_UNEXPECTED_STATUS_CODE === 'true';

let receivedData = resetReceivedData();

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix} (${process.pid}): :method :url :status`));
}

app.use(
  bodyParser.json({
    limit: '10mb'
  })
);

app.all('/preflight', (req, res) => {
  if (unresponsive) {
    // intentionally not responding for tests that verify proper timeout handling
    return;
  }

  if (preflightRespondsWithUnexpectedStatusCode) {
    return res.sendStatus(500);
  }

  res.sendStatus(200);
});

app.get('/received', (req, res) => res.json(receivedData));

app.delete('/received', (req, res) => {
  receivedData = resetReceivedData();
  return res.sendStatus(204);
});

app.get('/received/spans', (req, res) => res.json(receivedData.spans));

app.delete('/received/spans', (req, res) => {
  receivedData.spans = [];
  return res.sendStatus('204');
});

// With the exception of /preflight, the Lambda extension would forward all requests to the
// back end (serverless-acceptor). This handler mimicks that behavior.
app.all('*', (req, res) => {
  const stringifiedBody = JSON.stringify(req.body);
  logger.debug(`incoming request: ${req.method} ${req.url}: ${stringifiedBody}`);

  // Store spans so we can later verify that the spans were actually sent to the extension instead of having been
  // sent directly to the back end.
  if (req.url === '/bundle' && req.body.spans) {
    logger.debug({ msg: 'Storing spans from /bundle in extension', spans: req.body.spans });
    storeSpans(req.body.spans);
  } else if (req.url === '/traces' && Array.isArray(req.body)) {
    logger.debug({ msg: 'Storing spans from /traces in extension', spans: req.body });
    storeSpans(req.body);
  }

  if (unresponsive || preflightResponsiveButUnresponsiveLater) {
    // intentionally not responding for tests that verify proper timeout handling
    logger.debug({
      msg: 'Lambda extension mock will not respond.',
      unresponsive,
      preflightResponsiveButUnresponsiveLater
    });
    return;
  }

  // Forward data to the back end.
  const transport = process.env.BACKEND_HTTPS === 'true' ? https : http;
  const options = {
    hostname: 'localhost',
    port: process.env.BACKEND_PORT,
    path: `/serverless${req.url}`,
    method: req.method,
    headers: {
      ...req.headers
    }
  };
  logger.debug({ msg: 'Forwarding data to the back end.', data: stringifiedBody });
  const beReq = transport.request(options, backEndResponse => {
    logger.debug({ msg: `Forwarded data to the back end, status ${backEndResponse.status}`, data: stringifiedBody });
    res.sendStatus(backEndResponse.statusCode);
  });
  beReq.end(stringifiedBody);
});

http.createServer(app).listen(port, error => {
  if (error) {
    logger.error(error);
    return process.exit(1);
  } else {
    logger.info('Listening on port: %s (HTTP)', port);
    sendToParent('extension: started');
  }
});

function storeSpans(spansFromThisRequest) {
  receivedData.spans = receivedData.spans.concat(spansFromThisRequest);
}

function resetReceivedData() {
  return {
    spans: []
  };
}
