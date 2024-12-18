/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

// Here, we're using the SDK for testing, so importing the collector directly.
import instanaFactory from '../../../../src/index.js';
const instana = instanaFactory();

import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';
import getAppPort from '../../../test_util/app-port.js';
const port = getAppPort();

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

app.get(
  '/annotate-with-middleware',
  annotateWithPathTemplate('/user/{id}/details'),
  authenticationMiddleware(),
  (req, res) => {
    res.sendStatus(200);
  }
);

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
