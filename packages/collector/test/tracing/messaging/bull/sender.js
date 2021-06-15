/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

require('../../../../')();
const logPrefix = `Bull (${process.pid}):\t`;
const Queue = require('bull');
const redisServer = process.env.REDIS_SERVER || 'redis://127.0.0.1:6379';
const queueName = process.env.BULL_QUEUE_NAME || 'nodejs-team';
const express = require('express');
const port = process.env.APP_SENDER_PORT || 3215;
const bullJobName = process.env.BULL_JOB_NAME || 'steve';

const app = express();

const sender = new Queue(queueName, redisServer);

function getJobData(testId, bulkIndex, withError) {
  const rnd = Math.random() * 1e9;
  if (bulkIndex) {
    return {
      testId,
      bulkIndex,
      name: `I am in a bulk; ${rnd};`,
      withError
    };
  }
  return {
    testId,
    name: `Job with random number: ${rnd}`,
    withError
  };
}

const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

// curl -X POST "http://127.0.0.1:3215/send?jobName=true&bulk=false&repeat=true"
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
      every: 100,
      limit: 2
    };
  }

  if (bulk) {
    addFunction = 'addBulk';
    bulkedJobs.push(
      { name: bullJobName, data: getJobData(testId, 1, withError) },
      { name: bullJobName, data: getJobData(testId, 2, withError) }
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

  response.send({
    status: `Job${repeat || bulk ? 's' : ''} sent`
  });
});

app.get('/', (_req, res) => {
  res.send('ok');
});

app.listen(port, () => log(`Bull sender app listening on port ${port}`));
