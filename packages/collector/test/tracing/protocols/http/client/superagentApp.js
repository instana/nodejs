/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpressV4');

// Deliberately requiring superagent before instana to test experimental on-demand instrumentation for it.
const superagent = require('superagent');

const instana = require('../../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const port = require('../../../../test_util/app-port')();
const asyncRoute = require('../../../../test_util/asyncExpressRoute');

const agentPort = process.env.INSTANA_AGENT_PORT;
const baseUrl = `http://localhost:${process.env.SERVER_PORT}`;
const app = express();

const logPrefix = `HTTP client (superagent): (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => res.sendStatus(200));

app.get('/callback', (req, res) => {
  superagent.get(createUrl('/request-url-opts'), err => {
    if (err) {
      log(err);
      return res.sendStatus(500);
    }
    superagent.get(`http://127.0.0.1:${agentPort}`, err2 => {
      if (err2) {
        log(err2);
        return res.sendStatus(500);
      }
      res.sendStatus(200);
    });
  });
});

app.get('/then', async (req, res) => {
  superagent
    .get(createUrl('/request-url-opts'))
    .then(() => superagent.get(`http://127.0.0.1:${agentPort}`))
    .then(() => res.sendStatus(200))
    .catch(err => {
      log(err);
      res.sendStatus(500);
    });
});

app.get('/catch', async (req, res) => {
  superagent
    .get(createUrl('/does-not-exist'))
    .then(() => {
      res.sendStatus(500);
    })
    .catch(() => superagent.get(`http://127.0.0.1:${agentPort}`).then(() => res.sendStatus(200)));
});

app.get(
  '/await',
  asyncRoute(async (req, res) => {
    try {
      await superagent.get(createUrl('/request-url-opts'));
      await superagent.get(`http://127.0.0.1:${agentPort}`);
      res.sendStatus(200);
    } catch (err) {
      log(err);
      res.sendStatus(500);
    }
  })
);

app.get(
  '/await-fail',
  asyncRoute(async (req, res) => {
    try {
      await superagent.get(createUrl('/does-not-exist'));
      res.sendStatus(500);
    } catch (err) {
      await superagent.get(`http://127.0.0.1:${agentPort}`);
      res.sendStatus(200);
    }
  })
);

app.listen(port, () => {
  // Instrumenting superagent late on demand. That we do it in app.listen is quite arbitrary but since this happens
  // aynchronously after bootstrapping the app, it emulates a common real world usage.
  instana.experimental.instrument('superagent', superagent);

  log(`Listening on port: ${port}`);
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
