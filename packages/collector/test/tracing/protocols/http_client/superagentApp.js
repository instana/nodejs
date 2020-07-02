'use strict';

require('../../../../')();

const bodyParser = require('body-parser');
const superagent = require('superagent');
const express = require('express');
const morgan = require('morgan');

const baseUrl = `http://127.0.0.1:${process.env.SERVER_PORT}`;

const app = express();

const logPrefix = `HTTP client (superagent): (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => res.sendStatus(200));

app.get('/request', (req, res) => {
  superagent
    .get(createUrl('/request-url-opts'))
    .then(() => {
      res.sendStatus(200);
    })
    .catch(err => {
      log(err);
      res.sendStatus(500);
    });
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function createUrl(urlPath) {
  return baseUrl + urlPath;
}

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
