/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

require('../../../../')();

const logPrefix = `Bull (${process.pid}):\t`;
const Queue = require('bull');
const express = require('express');
const { ProcessTypes, buildReceiver } = require('./util');
const port = process.env.APP_RECEIVER_PORT || 3216;
const redisServer = process.env.REDIS_SERVER || 'redis://127.0.0.1:6379';
const queueName = process.env.BULL_QUEUE_NAME || 'nodejs-team';
const validCallbackTypes = ['Callback', 'Promise', 'Process'];
const receiveType = process.env.BULL_RECEIVE_TYPE || 'Callback';
const receiver = new Queue(queueName, redisServer);
const bullJobName = process.env.BULL_JOB_NAME || 'steve';
const jobNameEnabled = process.env.BULL_JOB_NAME_ENABLED === 'true';
const concurrencyEnabled = process.env.BULL_CONCURRENCY_ENABLED === 'true';

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

const app = express();

app.get('/', (_req, res) => {
  res.send('Ok');
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix}${args[0]}`;
  console.log.apply(console, args);
  /* eslint-enable no-console */
}

app.listen(port, () => log(`Bull receiver app listening on port ${port}`));
