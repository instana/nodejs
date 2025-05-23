/*
 * (c) Copyright IBM Corp. 2022
 */
/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('./mockVersion');
require('@instana/core/test/test_util/loadExpressV4');

require('../../../..')();

const redis = require(process.env.REDIS_PKG);
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const fetch = require('node-fetch-v2');
const port = require('../../../test_util/app-port')();

const cls = require('../../../../../core/src/tracing/cls');
const app = express();
const redisVersion = process.env.REDIS_VERSION;
const isConnectedViaPool = process.env.REDIS_SETUP_TYPE === 'pool';
const logPrefix =
  `Redis App (version: ${redisVersion}, require: ${process.env.REDIS_PKG}, ` +
  `setup type: ${process.env.REDIS_SETUP_TYPE}, pid: ${process.pid}):\t`;
const agentPort = process.env.INSTANA_AGENT_PORT;

let connectedToRedis = false;
let connection;
let connection2;
const connect = require('./connect-via');

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}

(async () => {
  const { connection1, connection2: _connection2 } = await connect(redis, log);

  connection = connection1;
  connection2 = _connection2;
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
  cls.isTracing() && cls.setTracingLevel('0');

  if (process.env.REDIS_SETUP_TYPE === 'cluster') {
    try {
      await Promise.all(
        connection.masters.map(async master => {
          const client = await connection.nodeClient(master);
          await client.flushAll();
        })
      );
    } catch (err) {
      log('Failed to flush cluster', err);
      res.sendStatus(500);
    }
  } else {
    await connection.flushAll();
  }

  cls.isTracing() && cls.setTracingLevel('1');
  res.sendStatus(200);
});

app.post('/values', async (req, res) => {
  const key = req.query.key;
  const value = req.query.value;

  try {
    await connection.set(key, value);
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
    const redisRes = await connection.get(key);
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
  await connection.hVals('key1');
  await fetch(`http://127.0.0.1:${agentPort}`);
  log('Sent agent request successfully.');
  res.sendStatus(200);
});

app.get('/blocking', async (req, res) => {
  try {
    const blPopPromise = isConnectedViaPool
      ? connection.blPop('mykey', 0)
      : connection.blPop(redis.commandOptions({ isolated: true }), 'mykey', 0);

    await connection.lPush('mykey', ['1', '2']);
    await blPopPromise;

    await fetch(`http://127.0.0.1:${agentPort}`);
    log('Agent request sent successfully.');

    connection.destroy();

    res.sendStatus(200);
  } catch (err) {
    log('Unexpected err', err);
    res.sendStatus(500);
  }
});

app.get('/scan-iterator', async (req, res) => {
  if (redisVersion === 'latest') {
    // v5: SCAN iterators return collection of keys, enabling multi-key commands like mGet
    // eslint-disable-next-line no-restricted-syntax
    for await (const keys of connection.scanIterator()) {
      try {
        await connection.mGet(keys);
      } catch (getErr) {
        // ignore for now
      }
    }
  } else {
    // v4: SCAN iterators return individual keys
    // eslint-disable-next-line no-restricted-syntax
    for await (const key of connection.scanIterator()) {
      try {
        await connection.get(key);
      } catch (getErr) {
        // ignore for now
      }
    }
  }

  await fetch(`http://127.0.0.1:${agentPort}`);
  log('Sent agent request successfully.');

  res.sendStatus(200);
});

app.get('/hset-hget', async (req, res) => {
  await connection.hSet('someCollection1', 'key1', 'value1');

  // HGETALL = hGetAll internally, no need to add test coverage for both
  const result = await connection.hGetAll('someCollection1');
  await fetch(`http://127.0.0.1:${agentPort}`);
  res.status(200).send(result.key1);
});

app.get('/get-without-waiting', (req, res) => {
  const key = req.query.key;
  connection.get(key);
  fetch(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
});

app.get('/set-without-waiting', (req, res) => {
  const key = req.query.key;
  const value = req.query.value;

  connection.set(key, value);

  fetch(`http://127.0.0.1:${agentPort}`).then(() => {
    res.sendStatus(200);
  });
});

app.get('/failure', async (req, res) => {
  try {
    // simulating wrong get usage
    const redisRes = await connection.get(null);
    res.send(redisRes);
  } catch (err) {
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(500);
  }
});

app.get('/multi', async (req, res) => {
  try {
    await connection.multi().set('key', 'value').get('key').exec();
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  } catch (err) {
    log('Multi failed', err);
    res.sendStatus(500);
  }
});

app.get('/multi-no-waiting', async (req, res) => {
  try {
    connection.multi().set('key', 'value').get('key').exec();
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
    await connection.multi().set('key', 'value').get(null).exec();
    res.sendStatus(500);
  } catch (err) {
    log('Multi expected to fail', err);
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.sendStatus(200);
  }
});

app.get('/batchSuccess', async (req, res) => {
  await connection.multi().get('1').set('2', '2').execAsPipeline();
  await fetch(`http://127.0.0.1:${agentPort}`);
  res.sendStatus(200);
});

app.get('/batchFailure', async (req, res) => {
  try {
    await connection.multi().get(null).set('2', '2').execAsPipeline();
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
    await connection.set(key, value);
    const result = await connection.get(key);
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
    response.response1 = await connection.set(req.query.key, req.query.value1);
    response.response2 = await connection2.set(req.query.key, req.query.value2);
    res.json(response);
  } catch (e) {
    log('Redis set operation failed.', e);
    res.sendStatus(500);
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
