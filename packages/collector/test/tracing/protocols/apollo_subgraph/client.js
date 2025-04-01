/*
 * (c) Copyright IBM Corp. 2021
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpressV4');

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const fetch = require('node-fetch-v2');

const serverPort = process.env.SERVER_PORT;
const serverBaseUrl = `http://127.0.0.1:${serverPort}`;
const serverGraphQLEndpoint = `${serverBaseUrl}/graphql`;

const app = express();
const port = require('../../../test_util/app-port')();
const logPrefix = `Apollo Subgraph Client (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('OK');
});

app.post('/query', (req, res) => runQuery(req, res));

function runQuery(req, res) {
  const queryWithArgs = `me(withError: ${!!req.query.withError})`;
  const query = `
    query {
      ${queryWithArgs} {
        username
        reviews {
          body
          product {
            name
            upc
            inStock
          }
        }
      }
    }
  `;
  return runQueryViaHttp(query, res);
}

function runQueryViaHttp(query, res) {
  return fetch(serverGraphQLEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query
    })
  })
    .then(response => response.json())
    .then(data => {
      res.send(data);
    })
    .catch(error => {
      log(error);
      res.sendStatus(500);
    });
}

app.listen(port, () => {
  log(`Listening on port ${port} (downstream server port: ${serverPort}).`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
