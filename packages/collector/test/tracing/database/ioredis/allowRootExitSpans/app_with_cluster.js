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
let client2;

(async () => {
  const { connection, connection2 } = await connect(ioredis, log);

  client = connection;
  client2 = connection2;

  await delay(1000);
  try {
    await client.set('key', 'value');
    const client1Res = client.get('key');

    // await client2.set('key', 'value');
    // const client2Res = client2.get('key');

    log('multi result: %s, %s', client1Res);

    await client.quit();
    await client2.quit();
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
