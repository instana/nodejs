/*
 * (c) Copyright IBM Corp. 2022
 */
/* eslint-disable no-console */

'use strict';

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const redis = require('redis');
const fetch = require('node-fetch');
const port = require('../../../test_util/app-port')();

const cls = require('../../../../../core/src/tracing/cls');
const app = express();
const logPrefix = `Redis Latest App (${process.pid}):\t`;
let connectedToRedis = false;
const agentPort = process.env.INSTANA_AGENT_PORT;

const client = redis.createClient({ url: `redis://${process.env.REDIS}` });
const client2 = redis.createClient({ url: `redis://${process.env.REDIS_ALTERNATIVE}` });

[client, client2].forEach(c => {
  c.on('error', err => log('Redis Client Error', err));
});

(async () => {
  await client.connect();
  await client2.connect();
  connectedToRedis = true;
  log(`Connected to redis client (version: ${process.env.REDIS_VERSION}).`);
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
  cls.isTracing() && cls.setTracingLevel('0');
  await client.flushAll();

  cls.isTracing() && cls.setTracingLevel('1');
  res.sendStatus(200);
});

app.post('/values', async (req, res) => {
  const key = req.query.key;
  const value = req.query.value;

  try {
    await client.set(key, value);
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
    const redisRes = await client.get(key);
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
  await client.hVals('key1');
  await fetch(`http://127.0.0.1:${agentPort}`);
  log('Sent agent request successfully.');
  res.sendStatus(200);
});

app.get('/blocking', async (req, res) => {
  const blPopPromise = client.blPop(redis.commandOptions({ isolated: true }), 'mykey', 0);

  try {
    await client.lPush('mykey', ['1', '2']);
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
  for await (const key of client.scanIterator()) {
    try {
      await client.get(key);
    } catch (getErr) {
      // ignore for now
    }
  }

  await fetch(`http://127.0.0.1:${agentPort}`);
  log('Sent agent request successfully.');

  res.sendStatus(200);
});

app.get('/hset-hget', async (req, res) => {
  await client.hSet('someCollection1', 'key1', 'value1');
  // HGETALL = hGetAll internally, no need to add test coverage for both
  const result = await client.hGetAll('someCollection1');
  await fetch(`http://127.0.0.1:${agentPort}`);
  res.status(200).send(result.key1);
});

app.get('/get-without-waiting', (req, res) => {
  const key = req.query.key;
  client.get(key);
  fetch(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
});

app.get('/set-without-waiting', (req, res) => {
  const key = req.query.key;
  const value = req.query.value;

  client.set(key, value);

  fetch(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
});

app.get('/failure', async (req, res) => {
  try {
    // simulating wrong get usage
    const redisRes = await client.get(null);
    res.send(redisRes);
  } catch (err) {
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(500);
  }
});

app.get('/multi', async (req, res) => {
  try {
    await client.multi().set('key', 'value').get('key').exec();
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  } catch (err) {
    log('Multi failed', err);
    res.sendStatus(500);
  }
});

app.get('/multi-no-waiting', async (req, res) => {
  try {
    client.multi().set('key', 'value').get('key').exec();
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
    await client.multi().set('key', 'value').get(null).exec();
    res.sendStatus(500);
  } catch (err) {
    log('Multi expected to fail', err);
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  }
});

app.get('/batchSuccess', async (req, res) => {
  await client.multi().get('1').set('2', '2').execAsPipeline();
  await fetch(`http://127.0.0.1:${agentPort}`);
  res.sendStatus(200);
});

app.get('/batchFailure', async (req, res) => {
  try {
    await client.multi().get(null).set('2', '2').execAsPipeline();
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
    await client.set(key, value);
    const result = await client.get(key);
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
    response.response1 = await client.set(req.query.key, req.query.value1);
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
