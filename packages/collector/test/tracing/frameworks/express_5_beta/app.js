/*
 * (c) Copyright IBM Corp. 2024
 */

/* eslint-disable no-console */
/* eslint-disable no-unused-vars */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const mock = require('mock-require');
mock('express', 'express-v5-beta');
const instana = require('../../../..')();
const express = require('express');
const morgan = require('morgan');
const port = require('../../../test_util/app-port')();

const app = express();
const logPrefix = `Express-5-beta HTTP: Server (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

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

app.get('/with-annotate', (req, res) => {
  instana.currentSpan().annotate('http.path_tpl', '/user/{id}/details');
  res.send();
});

app.get(
  '/annotate-with-middleware',
  annotateWithPathTemplate('/user/{id}/details'),
  authenticationMiddleware(),
  (req, res) => {
    res.sendStatus(200);
  }
);

app.get('/customErrorHandler', (req, res) => {
  throw new Error('To be caught by custom error handler');
});

app.use((err, req, res, next) => {
  res.sendStatus(400);
});

app.get('/defaultErrorHandler', (req, res) => {
  throw new Error('To be caught by default error handler');
});

function sendRoute(req, res) {
  res.send(req.baseUrl + req.route.path);
}

function annotateWithPathTemplate(pathTemplate) {
  return (req, res, next) => {
    instana.currentSpan().annotate('http.path_tpl', pathTemplate);
    next();
  };
}

function authenticationMiddleware() {
  return (req, res, next) => {
    if (req.query.authenticated === 'true') {
      next();
    } else {
      res.sendStatus(403);
    }
  };
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
