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

// TODO: require('redis') and require('@redis/client') needs to be covered
const redis = require('@redis/client');
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

app.get('/hvals', async (req, res) => {
  await cluster.hVals('key1');
  await fetch(`http://127.0.0.1:${agentPort}`);
  log('Sent agent request successfully.');
  res.sendStatus(200);
});

app.get('/blocking', async (req, res) => {
  const blPopPromise = cluster.blPop(redis.commandOptions({ isolated: true }), 'mykey', 0);

  try {
    await cluster.lPush('mykey', ['1', '2']);
    await blPopPromise; // '2'

    await fetch(`http://127.0.0.1:${agentPort}`);
    log('Sent agent request successfully.');

    res.sendStatus(200);
  } catch (err) {
    log('Unexpected err', err);
    res.sendStatus(500);
  }
});

app.get('/scan-iterator', async (req, res) => {
  // eslint-disable-next-line no-restricted-syntax
  for await (const key of cluster.scanIterator()) {
    try {
      await cluster.get(key);
    } catch (getErr) {
      // ignore for now
    }
  }

  await fetch(`http://127.0.0.1:${agentPort}`);
  log('Sent agent request successfully.');

  res.sendStatus(200);
});

app.get('/hset-hget', async (req, res) => {
  await cluster.hSet('someCollection1', 'key1', 'value1');
  // HGETALL = hGetAll internally, no need to add test coverage for both
  const result = await cluster.hGetAll('someCollection1');
  await fetch(`http://127.0.0.1:${agentPort}`);
  res.status(200).send(result.key1);
});

app.get('/get-without-waiting', (req, res) => {
  const key = req.query.key;
  cluster.get(key);
  fetch(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
});

app.get('/set-without-waiting', (req, res) => {
  const key = req.query.key;
  const value = req.query.value;

  cluster.set(key, value);

  fetch(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
});

app.get('/failure', async (req, res) => {
  try {
    // simulating wrong get usage
    const redisRes = await cluster.get(null);
    res.send(redisRes);
  } catch (err) {
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(500);
  }
});

app.get('/multi', async (req, res) => {
  try {
    await cluster.multi().set('key', 'value').get('key').exec();
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  } catch (err) {
    log('Multi failed', err);
    res.sendStatus(500);
  }
});

app.get('/multi-no-waiting', async (req, res) => {
  try {
    cluster.multi().set('key', 'value').get('key').exec();
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  } catch (err) {
    log('Multi failed', err);
    res.sendStatus(500);
  }
});

app.get('/multiFailure', async (req, res) => {
  // simulating wrong get usage
  try {
    await cluster.multi().set('key', 'value').get(null).exec();
    res.sendStatus(500);
  } catch (err) {
    log('Multi expected to fail', err);
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  }
});

app.get('/batchSuccess', async (req, res) => {
  await cluster.multi().get('1').set('2', '2').execAsPipeline();
  await fetch(`http://127.0.0.1:${agentPort}`);
  res.sendStatus(200);
});

app.get('/batchFailure', async (req, res) => {
  try {
    await cluster.multi().get(null).set('2', '2').execAsPipeline();
    res.sendStatus(500);
  } catch (err) {
    log('Batch expected to fail', err);
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  }
});

app.get('/callSequence', async (req, res) => {
  const key = 'foo';
  const value = 'bar';

  try {
    await cluster.set(key, value);
    const result = await cluster.get(key);
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.send(result);
  } catch (err) {
    log('Set/Get with key %s, value %s failed', key, value, err);
    res.sendStatus(500);
  }
});

app.post('/two-different-target-hosts', async (req, res) => {
  try {
    const response = {};
    response.response1 = await cluster.set(req.query.key, req.query.value1);
    response.response2 = await client2.set(req.query.key, req.query.value2);
    res.json(response);
  } catch (e) {
    log('Redis set operation failed.', e);
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
