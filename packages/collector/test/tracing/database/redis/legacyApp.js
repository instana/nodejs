/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const redis = require('redis');
const request = require('request-promise-native');
const port = require('../../../test_util/app-port')();

const cls = require('../../../../../core/src/tracing/cls');
const app = express();
const logPrefix = `Redis Legacy App (${process.pid}):\t`;
let connectedToRedis = false;

const agentPort = process.env.INSTANA_AGENT_PORT;

let client;
if (process.env.REDIS_VERSION === 'v3') {
  client = redis.createClient(`//${process.env.REDIS}`);
} else {
  // v0
  const portAndHost = process.env.REDIS.split(':');
  client = redis.createClient(portAndHost[1], portAndHost[0]);
}

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

app.post('/clearkeys', (req, res) => {
  cls.isTracing() && cls.setTracingLevel('0');

  client.flushall(err => {
    cls.isTracing() && cls.setTracingLevel('1');
    if (err) return res.sendStatus(500);
    res.sendStatus(200);
  });
});

app.post('/values', (req, res) => {
  const key = req.query.key;
  const value = req.query.value;
  client.set(key, value, err => {
    if (err) {
      log('Set with key %s, value %s failed', key, value, err);
      res.sendStatus(500);
    } else {
      request(`http://127.0.0.1:${agentPort}`).then(() => {
        res.sendStatus(200);
      });
    }
  });
});

app.get('/hset-hget', (req, res) => {
  client.hset('someCollection1', 'key1', 'value1', setErr => {
    if (setErr) {
      log('Hset with key %s, value %s failed', setErr);
      res.sendStatus(500);
    } else {
      client.hget('someCollection1', 'key1', (getErr, val) => {
        if (getErr) {
          log('Hget with key %s, value %s failed', getErr);
          return res.sendStatus(500);
        }

        request(`http://127.0.0.1:${agentPort}`).then(() => {
          res.status(200).send(val);
        });
      });
    }
  });
});

// https://github.com/redis/node-redis/blob/v3.1.2/test/commands/get.spec.js#L75
app.get('/get-without-waiting', (req, res) => {
  const key = req.query.key;
  client.get(key);
  request(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
});

app.get('/set-without-waiting', (req, res) => {
  const key = req.query.key;
  const value = req.query.value;

  client.set(key, value);

  request(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
});

app.get('/values', (req, res) => {
  const key = req.query.key;
  client.get(key, (err, redisRes) => {
    if (err) {
      log('Get with key %s failed', key, err);
      res.sendStatus(500);
    } else {
      request(`http://127.0.0.1:${agentPort}`).then(() => {
        res.send(redisRes);
      });
    }
  });
});

app.get('/failure', (req, res) => {
  // simulating wrong get usage
  client.get('someCollection', 'someKey', 'someValue', (err, redisRes) => {
    if (err) {
      request(`http://127.0.0.1:${agentPort}`).then(() => {
        res.sendStatus(500);
      });
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
        request(`http://127.0.0.1:${agentPort}`).then(() => {
          res.sendStatus(200);
        });
      }
    });
});

app.get('/multi-sub-cb', (req, res) => {
  client
    .multi()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key', 'too', 'many', function () {
      // ignore
    })
    .exec(err => {
      if (err) {
        log('Multi failed', err);

        request(`http://127.0.0.1:${agentPort}`).then(() => {
          res.sendStatus(200);
        });
      } else {
        res.sendStatus(500);
      }
    });
});

app.get('/multi-no-waiting', (req, res) => {
  client.multi().hset('someCollection', 'key', 'value').hget('someCollection', 'key').exec();

  request(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
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
        request(`http://127.0.0.1:${agentPort}`).then(() => {
          res.sendStatus(200);
        });
      } else {
        res.sendStatus(500);
      }
    });
});

// Difference to multi: a batch can succeed when a single operation fails
app.get('/batchSuccess', (req, res) => {
  client
    .batch()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key')
    .exec(err => {
      if (err) {
        log('batch should not fail', err);
        res.sendStatus(500);
      } else {
        request(`http://127.0.0.1:${agentPort}`).then(() => {
          res.sendStatus(200);
        });
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
        log('batch should not fail', err);
        res.sendStatus(500);
      } else {
        request(`http://127.0.0.1:${agentPort}`).then(() => {
          res.sendStatus(200);
        });
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

      request(`http://127.0.0.1:${agentPort}`).then(() => {
        res.send(result);
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
