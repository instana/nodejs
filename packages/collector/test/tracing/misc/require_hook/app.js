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

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express-v4');
const morgan = require('morgan');
const port = require('../../../test_util/app-port')();
const app = express();
const logPrefix = `requireHook App (${process.pid}):\t`;
const stealthyRequire = require('stealthy-require');

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/multipleRequireWithStealthyRequire', async (req, res) => {
  // Wrap the require calls with stealthyRequire to avoid caching
  const firstInstance = stealthyRequire(require.cache, () => require('express'));
  const secondInstance = stealthyRequire(require.cache, () => require('express'));

  // Verify that the two instances of the 'got' module are different. In this scenario, we emulate the behavior of
  // stealthy-require, ensuring that each time we load the module, it is a fresh instance. This precaution is taken
  // to prevent require caching, and to guarantee the loading of a new module each time, as discussed and resolved
  // in the following PR: https://github.com/instana/nodejs/pull/71

  if (firstInstance !== secondInstance) {
    res.sendStatus(200);
  } else {
    res.sendStatus(500);
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
