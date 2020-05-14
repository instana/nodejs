/* eslint-disable no-console */

'use strict';

const instana = require('../../../../')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const app = express();
const logPrefix = `Express HTTP: Server (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/blub', sendRoute);

const subRoutes = express.Router();
subRoutes.get('/bar/:id', sendRoute);
app.use('/sub', subRoutes);

const subSubRoutes = express.Router();
subSubRoutes.get('/bar/:id', sendRoute);
subRoutes.use('/sub', subSubRoutes);

function sendRoute(req, res) {
  res.send(req.baseUrl + req.route.path);
}

app.get('/with-annotate', (req, res) => {
  instana.currentSpan().annotate('http.path_tpl', '/user/{id}/details');
  res.send();
});

app.get('/annotate-with-middleware', dummyMiddleware(), (req, res) => {
  instana.currentSpan().annotate('http.path_tpl', '/user/{id}/details');
  res.send();
});

function dummyMiddleware() {
  return (req, res, next) => next();
}

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
