/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import delay from '../../../../../core/test/test_util/delay.js';
import Queue from 'bull';

const logPrefix = `Bull Allow Root Exit Span App (${process.pid}):\t`;
const queueName = process.env.BULL_QUEUE_NAME;
const redisServer = process.env.REDIS_SERVER;
const bullJobName = process.env.BULL_JOB_NAME;

(async function run() {
  // wait till Instana is ready
  await delay(1000);

  log(`Creating job queue ${queueName} with job name ${bullJobName} with redis server ${redisServer}`);
  const sender = new Queue(queueName, redisServer);
  sender.add(bullJobName, { foo: 'bar' });
  log('Sent job to queue');
  await sender.close();
})();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
