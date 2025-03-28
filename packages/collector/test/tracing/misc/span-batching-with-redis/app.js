/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpress4');

require('./mockVersion');
require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const redis = require('redis');
const fetch = require('node-fetch-v2');
const port = require('../../../test_util/app-port')();
const app = express();
const logPrefix = `Redis Batching App (${process.pid}):\t`;
let connectedToRedis = false;
const agentPort = process.env.INSTANA_AGENT_PORT;
const client = redis.createClient(`//${process.env.REDIS}`);

client.on('ready', () => {
  connectedToRedis = true;
});

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (!connectedToRedis) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.post('/quick-successive-calls', (req, res) => {
  const key = req.query.key;
  const value = req.query.value;

  let redisGetResponse1;

  client.set(key, value, err1 => {
    if (err1) {
      log('client.set with key %s and value %s failed', key, value, err1);
      return res.sendStatus(500);
    }
    client.get(key, (err2, redisRes1) => {
      if (err2) {
        log('Get with key %s failed', key, err2);
        return res.sendStatus(500);
      }
      redisGetResponse1 = redisRes1;
      client.get(key, (err3, redisRes2) => {
        if (err3) {
          log('Get with key %s failed', key, err3);
          return res.sendStatus(500);
        }
        if (redisRes2 !== redisGetResponse1) {
          log(`Consecutive read access returned different results: ${redisGetResponse1} != ${redisRes2}`);
          return res.sendStatus(500);
        }
        fetch(`http://127.0.0.1:${agentPort}`).then(() => {
          res.send(redisGetResponse1);
        });
      });
    });
  });
});

app.post('/quick-successive-calls-with-errors', (req, res) => {
  client.set('irrelevant-key', 'irrelevant-value', err1 => {
    if (err1) {
      log('client.set failed', err1);
      return res.sendStatus(500);
    }
    client.get('wrong', 'number', 'of', 'arguments', err2 => {
      if (!err2) {
        log('Get unexpectedly succeeded');
        return res.sendStatus(500);
      }
      client.get('wrong', 'number', 'of', 'arguments', err3 => {
        if (!err3) {
          log('Get unexpectedly succeeded');
          return res.sendStatus(500);
        }
        fetch(`http://127.0.0.1:${agentPort}`).then(() => {
          res.send('done');
        });
      });
    });
  });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
