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
const request = require('request-promise-native');

const app = express();
const logPrefix = `Redis Latest App (${process.pid}):\t`;
let connectedToRedis = false;
const agentPort = process.env.INSTANA_AGENT_PORT;

const client = redis.createClient({ url: `redis://${process.env.REDIS}` });
client.on('error', err => log('Redis Client Error', err));

(async () => {
  await client.connect();
  connectedToRedis = true;
  log('Connected to redis client.', process.env.REDIS_VERSION);
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
  await request(`http://127.0.0.1:${agentPort}`);
  log('Sent agent request successfully.');
  res.sendStatus(200);
});

app.get('/hvals', async (req, res) => {
  await client.hVals('key1');
  await request(`http://127.0.0.1:${agentPort}`);
  log('Sent agent request successfully.');
  res.sendStatus(200);
});

app.get('/blocking', async (req, res) => {
  const blPopPromise = client.blPop(redis.commandOptions({ isolated: true }), 'mykey', 0);

  try {
    await client.lPush('mykey', ['1', '2']);
    await blPopPromise; // '2'

    await request(`http://127.0.0.1:${agentPort}`);
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

  await request(`http://127.0.0.1:${agentPort}`);
  log('Sent agent request successfully.');

  res.sendStatus(200);
});

app.get('/hset-hget', async (req, res) => {
  await client.hSet('someCollection1', 'key1', 'value1');
  // HGETALL = hGetAll internally, no need to add test coverage for both
  const result = await client.hGetAll('someCollection1');
  await request(`http://127.0.0.1:${agentPort}`);
  res.status(200).send(result.key1);
});

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

app.get('/values', async (req, res) => {
  const key = req.query.key;

  try {
    const redisRes = await client.get(key);
    log('Got redis key successfully.');
    await request(`http://127.0.0.1:${agentPort}`);
    log('Sent agent request successfully.');
    res.send(redisRes);
  } catch (err) {
    log('Get with key %s failed', key, err);
    res.sendStatus(500);
  }
});

app.get('/failure', async (req, res) => {
  try {
    // simulating wrong get usage
    const redisRes = await client.get(null);
    res.send(redisRes);
  } catch (err) {
    await request(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(500);
  }
});

app.get('/multi', async (req, res) => {
  try {
    await client.multi().set('key', 'value').get('key').exec();
    await request(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  } catch (err) {
    log('Multi failed', err);
    res.sendStatus(500);
  }
});

app.get('/multi-no-waiting', async (req, res) => {
  try {
    client.multi().set('key', 'value').get('key').exec();
    await request(`http://127.0.0.1:${agentPort}`);
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
    await request(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  }
});

app.get('/batchSuccess', async (req, res) => {
  await client.multi().get('1').set('2', '2').execAsPipeline();
  await request(`http://127.0.0.1:${agentPort}`);
  res.sendStatus(200);
});

app.get('/batchFailure', async (req, res) => {
  try {
    await client.multi().get(null).set('2', '2').execAsPipeline();
    res.sendStatus(500);
  } catch (err) {
    log('Batch expected to fail', err);
    await request(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  }
});

app.get('/callSequence', async (req, res) => {
  const key = 'foo';
  const value = 'bar';

  try {
    await client.set(key, value);
    const result = await client.get(key);
    await request(`http://127.0.0.1:${agentPort}`);
    res.send(result);
  } catch (err) {
    log('Set/Get with key %s, value %s failed', key, value, err);
    res.sendStatus(500);
  }
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
