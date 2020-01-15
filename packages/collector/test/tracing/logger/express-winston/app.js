/* eslint-disable no-console */

'use strict';

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const expressWinston = require('express-winston');
const winston1x = require('../../../../../../node_modules/express-winston/node_modules/winston');

const app = express();
const logPrefix = `express-winston app (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.use(
  expressWinston.logger({
    transports: [new winston1x.transports.Console()],
    statusLevels: true
  })
);

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/200', (req, res) => {
  res.sendStatus(200);
});

app.get('/400', (req, res) => {
  res.sendStatus(400);
});

app.get('/500', (req, res) => {
  res.sendStatus(500);
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
