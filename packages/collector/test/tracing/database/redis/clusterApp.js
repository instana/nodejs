/*
 * (c) Copyright IBM Corp. 2024
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
const express = require('express');
const morgan = require('morgan');

const redis = process.env.REDIS_PKG === 'new' ? require('@redis/client') : require('redis');
const fetch = require('node-fetch-v2');
const port = require('../../../test_util/app-port')();

const cls = require('../../../../../core/src/tracing/cls');
const app = express();
const logPrefix = `Redis Cluster App (${process.pid}):\t`;
let connectedToRedis = false;
const agentPort = process.env.INSTANA_AGENT_PORT;

// node bin/start-test-containers.js --redis-node-0 --redis-node-1 --redis-node-2
// docker exec -it 2aaaac7b9112 redis-cli -p 6379 cluster info
const cluster = redis.createCluster({
  rootNodes: [
    {
      url: `redis://${process.env.REDIS_NODE_1}`
    },
    {
      url: `redis://${process.env.REDIS_NODE_2}`
    },
    {
      url: `redis://${process.env.REDIS_NODE_3}`
    }
  ],
  useReplicas: false,
  defaults: {
    url: `redis://${process.env.REDIS_NODE_1}`
  }
});

[cluster].forEach(c => {
  c.on('error', err => log('Redis Cluster Error', err));
});

(async () => {
  log(`Connecting to cluster. (${process.env.REDIS_NODE_1}, ${process.env.REDIS_NODE_2}, ${process.env.REDIS_NODE_3})`);
  await cluster.connect();
  log('Connected to cluster');
  connectedToRedis = true;
})();

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

app.post('/clearkeys', async (req, res) => {
  if (cls.isTracing()) {
    cls.setTracingLevel('0');
  }

  await Promise.all(
    cluster.masters.map(async master => {
      const client = await cluster.nodeClient(master);
      await client.flushAll();
    })
  );

  if (cls.isTracing()) {
    cls.setTracingLevel('1');
  }

  res.sendStatus(200);
});

app.post('/values', async (req, res) => {
  const key = req.query.key;
  const value = req.query.value;

  try {
    await cluster.set(key, value);
    log('Set key successfully.');
  } catch (e) {
    log('Set with key %s, value %s failed', key, value, e);
    res.sendStatus(500);
  }
  await fetch(`http://127.0.0.1:${agentPort}`);
  log('Sent agent fetch successfully.');
  res.sendStatus(200);
});

app.get('/values', async (req, res) => {
  const key = req.query.key;

  try {
    const redisRes = await cluster.get(key);
    log('Got redis key successfully.');
    await fetch(`http://127.0.0.1:${agentPort}`);
    log('Sent agent request successfully.');
    res.send(redisRes);
  } catch (err) {
    log('Get with key %s failed', key, err);
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
