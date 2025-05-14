/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../..')({
  tracing: {
    allowRootExitSpan: true
  }
});

const redis = require(process.env.REDIS_PKG);
const { delay } = require('@instana/core/test/test_util');

const redisVersion = process.env.REDIS_VERSION;
const logPrefix = `Redis allowRootExitSpan App (version: ${redisVersion}, 
require: ${process.env.REDIS_PKG}):\t`;

log(logPrefix);

let client;

(async function connectRedis() {
  await delay(1000);

  try {
    client = redis.createClient({ url: `redis://${process.env.REDIS}` });
    client.on('error', err => {
      log('Redis client error:', err);
    });

    await client.connect();
    log('Redis connection established');

    const result = await client.multi().set('key', 'value').get('key').exec();
    log('value:', result);

    // In v5, the quit is replaced by close
    if (redisVersion === 'latest') {
      await client.close();
    } else {
      await client.quit();
    }
  } catch (err) {
    log('Failed to connect to Redis:', err);
  }
})();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
