/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import express from 'express';
import Queue from 'bull';

const app = express();
import portFactory from '../../../test_util/app-port.js';
const port = portFactory();

const logPrefix = `Bull ESM (${process.pid}):\t`;
const redisServer = process.env.REDIS_SERVER || 'redis://127.0.0.1:6379';
const queueName = process.env.BULL_QUEUE_NAME || 'nodejs-team';

const myQueue = new Queue(queueName, redisServer);

import { getLogger } from '@instana/core/test/test_util/log.js';
const log = getLogger(logPrefix);

myQueue.process(async job => {
  log(`Processing job ${job.id} with data:`, job.data);

  await new Promise(resolve => setTimeout(resolve, 2000));

  log(`Job ${job.id} completed`);
});

app.post('/add-job', async (req, res) => {
  try {
    const job = await myQueue.add({ message: 'Hello from Bull!' });
    log('Job added to queue', job.id);
    res.status(200).json({ success: true, jobId: job.id });
  } catch (error) {
    log('Error adding job:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

myQueue.on('error', error => {
  log('Queue error:', error);
});

app.listen(port, () => {
  log(`Bull ESM server is listening on port: ${port}`);
});
