/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const redis = require('ioredis');
const request = require('request-promise');

const app = express();
const logPrefix = `Express / Redis App (${process.pid}):\t`;
let connectedToRedis = true;

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
  client.get(key).then(
    redisRes => {
      res.send(redisRes);
    },
    err => {
      log('Get with key %s failed', key, err);
      res.sendStatus(500);
    }
  );
});

app.get('/keepTracing', (req, res) => {
  const key = req.query.key;
  let redisResponse = null;
  client
    .get(key)
    .then(redisRes => {
      redisResponse = redisRes;
      // Execute another traced call to verify that we keep the tracing context.
      return request(`http://127.0.0.1:${agentPort}`);
    })
    .then(httpRes => {
      res.send(`${httpRes};${redisResponse}`);
    })
    .catch(err => {
      log('Unexpected error for key %s', key, err);
      res.sendStatus(500);
    });
});

app.get('/keepTracingCallback', (req, res) => {
  // this uses a self created promise and a mix promise and callback styles,
  // in particular, it uses the ioredis optional callback argument.
  const key = req.query.key;
  return new Promise((resolve, reject) => {
    // using ioredis client with callback instead of a promise here
    client.get(key, (err, redisRes) => {
      if (err) {
        log('Get with key %s failed', key, err);
        reject(err);
        return;
      }
      // Execute another traced call to verify that we keep the tracing context.
      request(`http://127.0.0.1:${agentPort}`, (httpErr, httpRes) => {
        if (httpErr) {
          log('HTTP call failed', httpErr);
          return reject(httpErr);
        }
        return resolve(`${httpRes.body};${redisRes}`);
      });
    });
  })
    .then(result => {
      res.send(result);
    })
    .catch(err => {
      log('Unexpected error for key %s', key, err);
      res.sendStatus(500);
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
  // simulating wrong get usage
  client
    .multi()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key')
    .exec(err => {
      if (err) {
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
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.post('/multiKeepTracing', (req, res) => {
  let redisResponse = null;
  client
    .multi()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key')
    .exec()
    .then(redisRes => {
      redisResponse = redisRes;
      // Execute another traced call to verify that we keep the tracing context.
      return request(`http://127.0.0.1:${agentPort}`);
    })
    .then(httpRes => {
      res.send(`${httpRes};${redisResponse}`);
    })
    .catch(err => {
      log('Unexpected error', err);
      res.sendStatus(500);
    });
});

app.get('/pipeline', (req, res) => {
  client
    .pipeline()
    .hset('someCollection', 'key', 'value')
    .hset('someCollection', 'key2', 'value')
    .hget('someCollection', 'key')
    .exec(err => {
      if (err) {
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.get('/pipelineFailure', (req, res) => {
  client
    .pipeline()
    .hset('someCollection', 'key', 'value')
    .hset('someCollection', 'key2', 'value', 'tooManyArgs')
    .hget('someCollection', 'key')
    .exec(err => {
      if (err) {
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.post('/pipelineKeepTracing', (req, res) => {
  let redisResponse = null;
  client
    .pipeline()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key')
    .exec()
    .then(redisRes => {
      redisResponse = redisRes;
      // Execute another traced call to verify that we keep the tracing context.
      return request(`http://127.0.0.1:${agentPort}`);
    })
    .then(httpRes => {
      res.send(`${httpRes};${redisResponse}`);
    })
    .catch(err => {
      log('Unexpected error', err);
      res.sendStatus(500);
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
