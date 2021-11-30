/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable no-console */

'use strict';

require('../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const bodyParser = require('body-parser');
const rp = require('request-promise');
const express = require('express');
const morgan = require('morgan');
const http = require('http');
const baseUrl = `http://127.0.0.1:${process.env.SERVER_PORT}`;

const app = express();
const logPrefix = `Express HTTP client: Client (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  rp({
    method: 'GET',
    url: `${baseUrl}/`
  })
    .then(() => {
      res.sendStatus(200);
    })
    .catch(() => {
      res.sendStatus(500);
    });
});

app.get('/request-url-and-options', (req, res) => {
  http.request(createUrl(req, '/request-url-opts'), {}, () => res.sendStatus(200)).end();
});

app.get('/request-url-only', (req, res) => {
  http.request(createUrl(req, '/request-only-url'), () => res.sendStatus(200)).end();
});

app.get('/request-options-only', (req, res) => {
  http
    .request(
      {
        hostname: '127.0.0.1',
        port: process.env.SERVER_PORT,
        method: 'GET',
        path: '/request-only-opts'
      },
      () => res.sendStatus(200)
    )
    .end();
});

app.get('/request-options-only-null-headers', (req, res) => {
  http
    .request(
      {
        hostname: '127.0.0.1',
        port: process.env.SERVER_PORT,
        method: 'GET',
        path: '/request-only-opts',
        headers: null
      },
      () => res.sendStatus(200)
    )
    .end();
});

app.get('/get-url-and-options', (req, res) => {
  http.get(createUrl(req, '/get-url-opts'), { rejectUnauthorized: false }, () => res.sendStatus(200));
});

app.get('/get-url-only', (req, res) => {
  http.get(createUrl(req, '/get-only-url'), () => res.sendStatus(200));
});

app.get('/get-options-only', (req, res) => {
  http.get(
    {
      hostname: '127.0.0.1',
      port: process.env.SERVER_PORT,
      method: 'GET',
      path: '/get-only-opts'
    },
    () => res.sendStatus(200)
  );
});

app.get('/timeout', (req, res) => {
  rp({
    method: 'GET',
    url: `${baseUrl}/timeout`,
    timeout: 500
  })
    .then(() => {
      res.sendStatus(200);
    })
    .catch(() => {
      res.sendStatus(500);
    });
});

app.get('/abort', (req, res) => {
  const clientRequest = http.request({
    method: 'GET',
    hostname: '127.0.0.1',
    port: process.env.SERVER_PORT,
    path: '/timeout'
  });

  clientRequest.end();

  setTimeout(() => {
    clientRequest.abort();
    res.sendStatus(200);
  }, 1500);
});

app.get('/request-malformed-url', (req, res) => {
  try {
    http
      .request(
        //
        'ha-te-te-peh://999.0.0.1:not-a-port/malformed-url', //
        () => {
          console.log('This should not have happend!');
        }
      )
      .end();
  } catch (e) {
    http
      .request(
        {
          hostname: '127.0.0.1',
          port: process.env.SERVER_PORT,
          method: 'GET',
          path: '/request-only-opts'
        },
        () => res.sendStatus(200)
      )
      .end();
  }
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function createUrl(req, urlPath) {
  return req.query.urlObject ? new URL(urlPath, baseUrl) : baseUrl + urlPath;
}

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
