/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

/* eslint-disable no-console */

'use strict';

require('../../../../')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const redis = require('redis');
const request = require('request-promise-native');

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
        request(`http://127.0.0.1:${agentPort}`).then(() => {
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
        request(`http://127.0.0.1:${agentPort}`).then(() => {
          res.send('done');
        });
      });
    });
  });
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
