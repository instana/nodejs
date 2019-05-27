/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const redis = require('redis');

const app = express();
const logPrefix = `Express / Redis App (${process.pid}):\t`;
let connectedToRedis = false;

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

app.post('/values', (req, res) => {
  const key = req.query.key;
  const value = req.query.value;
  client.set(key, value, err => {
    if (err) {
      log('Set with key %s, value %s failed', key, value, err);
      res.sendStatus(500);
    } else {
      res.sendStatus(200);
    }
  });
});

app.get('/values', (req, res) => {
  const key = req.query.key;
  client.get(key, (err, redisRes) => {
    if (err) {
      log('Get with key %s failed', key, err);
      res.sendStatus(500);
    } else {
      res.send(redisRes);
    }
  });
});

app.get('/failure', (req, res) => {
  // simulating wrong get usage
  client.get('someCollection', 'someKey', 'someValue', (err, redisRes) => {
    if (err) {
      res.sendStatus(500);
    } else {
      res.send(redisRes);
    }
  });
});

app.get('/multi', (req, res) => {
  client
    .multi()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key')
    .exec(err => {
      if (err) {
        log('Multi failed', err);
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.get('/multiFailure', (req, res) => {
  // simulating wrong get usage
  client
    .multi()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key', 'too', 'many', 'args')
    .exec(err => {
      if (err) {
        log('Multi failed', err);
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.get('/batchFailure', (req, res) => {
  // simulating wrong get usage
  client
    .batch()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key', 'too', 'many', 'args')
    .exec(err => {
      if (err) {
        log('batch failed', err);
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.get('/callSequence', (req, res) => {
  const key = 'foo';
  const value = 'bar';
  client.set(key, value, err => {
    if (err) {
      log('Set with key %s, value %s failed', key, value, err);
      res.sendStatus(500);
      return;
    }

    client.get(key, (err2, result) => {
      if (err2) {
        log('get with key %s failed', key, err2);
        res.sendStatus(500);
        return;
      }

      res.send(result);
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
