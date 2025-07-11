/*
 * (c) Copyright IBM Corp. 2025
 */

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const logPrefix = `Bull Receiver ESM (${process.pid}):\t`;

import express from 'express';
import Queue from 'bull';

const app = express();
import portFactory from '../../../test_util/app-port.js';
const port = portFactory();
const { sendToParent } = (await import('@instana/core/test/test_util/index.js')).default;

import { ProcessTypes, buildReceiver } from './util.js';

const redisServer = process.env.REDIS_SERVER || 'redis://127.0.0.1:6379';
const queueName = process.env.BULL_QUEUE_NAME || 'nodejs-team';
const validCallbackTypes = ['Callback', 'Promise', 'Process'];
const receiveType = process.env.BULL_RECEIVE_TYPE || 'Callback';
const receiver = new Queue(queueName, redisServer);
const bullJobName = process.env.BULL_JOB_NAME || 'steve';
const jobNameEnabled = process.env.BULL_JOB_NAME_ENABLED === 'true';
const concurrencyEnabled = process.env.BULL_CONCURRENCY_ENABLED === 'true';

import { getLogger } from '@instana/core/test/test_util/log.js';
const log = getLogger(logPrefix);

/**
 * Make sure to match the sender and receiver when it comes to named jobs.
 * For instance, if you add a named job, but the receiver is started without being expecting named jobs, there will be
 * errors, as the receiver will not process jobs with that particular job name.
 *
 * eg: BULL_JOB_NAME_ENABLED=true node receiver.js
 *
 * By default, both sender and receiver will use the name "steve" for the named job. You can pass a new name by
 * providing the environment variable BULL_JOB_NAME=new_job_name in both receiver.js and sender.js.
 * If you provide the env var only in one of them, there will be an error.
 */

/**
 * Bull appears to swallow errors, but it emits these caught errors as an 'error' event.
 * We then capture these errors and send them to the parent process in the test and throw them
 */
receiver.on('error', err => {
  sendToParent({
    hasError: true,
    error: err.stack || err.message || 'Unknown error'
  });
});

if (!validCallbackTypes.includes(receiveType)) {
  log(`Callback types must be one of these: ${validCallbackTypes.join(', ')} but got ${receiveType}`);
  process.exit(1);
}

const receiveTypes = {
  Callback: ProcessTypes.CALLBACK,
  Promise: ProcessTypes.PROMISE,
  Process: ProcessTypes.AS_PROCESS
};

/**
 * Builds the Bull.process() function in all different cases
 */
buildReceiver(receiver, receiveTypes[receiveType], log, jobNameEnabled ? bullJobName : undefined, concurrencyEnabled);

app.get('/', (_req, res) => {
  res.send('Ok');
});

app.listen(port, () => {
  log(`ESM Bull receiver app listening on port ${port}`);
});
