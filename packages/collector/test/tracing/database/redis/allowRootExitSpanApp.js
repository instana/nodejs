/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('./mockVersion');

require('../../../..')({
  tracing: {
    allowRootExitSpan: true
  }
});

const redis = require(process.env.REDIS_PKG);
const { delay } = require('@instana/core/test/test_util');

const connect = require('./connect-via');
const redisVersion = process.env.REDIS_VERSION;
const logPrefix =
  `Redis allowRootExitSpan App (version: ${redisVersion}, require: ${process.env.REDIS_PKG}, ` +
  `setup type: ${process.env.REDIS_SETUP_TYPE}, pid: ${process.pid}):\t`;

log(logPrefix);

let client;

(async function main() {
  try {
    await delay(1000);

    const { connection1 } = await connect(redis, log);
    client = connection1;

    const result = await client.multi().set('key', 'value').get('key').exec();
    log('value:', result);
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
