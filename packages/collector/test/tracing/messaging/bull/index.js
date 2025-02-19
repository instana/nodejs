/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

require('../../../..')();

const express = require('express');
const Queue = require('bull');

const app = express();
const port = require('../../../test_util/app-port')();

const logPrefix = `Bull Index (${process.pid}):\t`;

const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

const jobQueue = new Queue('data-processing');

jobQueue.process(2, async () => {
  // Simulate a task with a delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  return { success: true };
});

jobQueue.on('failed', (job, err) => {
  log(`Job ${job.id} failed with error: ${err.message}`);
});

app.get('/process-jobs', async (req, res) => {
  try {
    const jobPromises = [];

    for (let i = 1; i <= 6; i++) {
      const job = jobQueue.add({ text: `Job number ${i}` });
      jobPromises.push(job);
      log(`Job ${i} added`);
    }

    await Promise.all(jobPromises);

    res.json({ message: 'Jobs added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add jobs' });
  }
});

app.listen(port, () => {
  log(`Server is running on http://localhost:${port}`);
});
