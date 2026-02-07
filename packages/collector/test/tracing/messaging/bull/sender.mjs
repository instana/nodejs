/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const logPrefix = `Bull Sender ESM (${process.pid}):\t`;

import express from 'express';
import Queue from 'bull';

const app = express();
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const portFactory = require('@_local/collector/test/test_util/app-port');
const port = portFactory();

const redisServer = process.env.REDIS_SERVER || 'redis://127.0.0.1:6379';
const queueName = process.env.BULL_QUEUE_NAME || 'nodejs-team';

const bullJobName = process.env.BULL_JOB_NAME || 'steve';
const sender = new Queue(queueName, redisServer);

function getJobData(testId, bulkIndex, withError) {
  const rnd = Math.random() * 1e9;
  if (bulkIndex) {
    return {
      testId,
      bulkIndex,
      name: `I am in a bulk; ${bulkIndex};`,
      withError
    };
  }
  return {
    testId,
    name: `Job with random number: ${rnd}`,
    withError
  };
}

const { getLogger } = require('@_local/core/test/test_util/log');
const log = getLogger(logPrefix);

/**
 * Example:
 * $ curl -X POST "http://127.0.0.1:3215/send?jobName=true&bulk=false&repeat=true"
 *
 * Remember to start the receiver with named jobs enabled when passing jobName=true.
 * To enable named jobs in the receiver, provide the proper environment variable:
 * $ BULL_JOB_NAME_ENABLED=true node receiver.js
 */
app.post('/send', (request, response) => {
  const testId = request.query.testId || 'none';
  const repeat = request.query.repeat === 'true';
  const jobName = request.query.jobName === 'true';
  const bulk = request.query.bulk === 'true';
  const withError = request.query.withError === 'true';

  /** @type {import('bull').JobOptions} */
  const options = {};
  let addFunction = 'add';
  const functionParams = [];
  const bulkedJobs = [];

  if (repeat && !bulk) {
    options.repeat = {
      every: 1000,
      limit: 2
    };
  }

  if (bulk) {
    addFunction = 'addBulk';
    let counter = 1;
    bulkedJobs.push(
      { name: bullJobName, data: getJobData(testId, counter++, withError) },
      { name: bullJobName, data: getJobData(testId, counter++, withError) },
      { name: bullJobName, data: getJobData(testId, counter++, withError) }

      // As per https://github.com/OptimalBits/bull/issues/1731, addBulk does not properly support repeatable jobs.
      // Newer versions of Bull forbid this case completely, and older versions don't handle the case properly.
      // { name: bullJobName, data: getJobData(testId, true), opts: { repeat: { every: 500, limit: 1 } } }
    );
    functionParams.push(bulkedJobs);
  } else if (jobName) {
    functionParams.push(bullJobName, getJobData(testId, null, withError), options);
  } else {
    functionParams.push(getJobData(testId, null, withError), options);
  }

  sender[addFunction].apply(sender, functionParams);

  response.json({
    status: `Job${repeat || bulk ? 's' : ''} sent`
  });
});

app.get('/', (_req, res) => {
  res.send('ok');
});

app.listen(port, () => log(`ESM Bull sender app listening on port ${port}`));
