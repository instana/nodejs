/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

require('../../../../')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const rp = require('request-promise');

const serverPort = process.env.SERVER_PORT || 3217;
const serverBaseUrl = `http://127.0.0.1:${serverPort}`;
const serverGraphQLEndpoint = `${serverBaseUrl}/graphql`;

const app = express();
const port = process.env.APP_PORT || 3216;
const logPrefix = `Apollo Federation Client (${process.pid}):\t`;

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
  return rp({
    method: 'POST',
    url: serverGraphQLEndpoint,
    body: JSON.stringify({
      query
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then(response => {
      res.send(response);
    })
    .catch(e => {
      log(e);
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
