/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../../..')({
  tracing: {
    allowRootExitSpan: true
  }
});

const ioredis = require('ioredis');
const connect = require('../connect-via');

const { delay } = require('@instana/core/test/test_util');

const logPrefix = `IORedis allowRootExitSpan App (${process.pid}):\t`;

log(logPrefix);

let client;

(async () => {
  const { connection } = await connect(ioredis, log);

  client = connection;

  await delay(1000);
  try {
    client.on('error', err => {
      log('IORedis client error:', err);
    });

    client.on('ready', () => {
      log(`Connected to client 1 (${process.env.REDIS}).`);
    });

    const resp = await client.multi().set('key', 'value').get('key').exec();

    log('multi result: %s, %s', resp);

    await client.quit();
  } catch (err) {
    log('Failed to connect to IORedis:', err);
  }
})();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
