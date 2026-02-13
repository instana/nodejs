/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const instana = require('../..');
const core = require('@_local/core');

const http = require('http');
const url = process.env.DOWNSTREAM_DUMMY_URL;

// We don't want to setup mysql/psql for aws-lambda tests. Just add http exit as batchable!
if (process.env.INSTANA_SPANBATCHING_ENABLED === 'true') {
  core.tracing.spanBuffer.addBatchableSpanName('node.http.client');
}

const sendReq = async () => {
  return new Promise(function (resolve, reject) {
    http
      .get(url, () => {
        resolve();
      })
      .on('error', e => {
        reject(Error(e));
      });
  });
};

exports.handler = instana.wrap(async () => {
  const numberOfIterations = process.env.INSTANA_NUMBER_OF_ITERATIONS;
  const tasks = [];

  for (let i = 0; i < numberOfIterations; i++) {
    tasks.push(sendReq());
  }

  await Promise.all(tasks);

  return {
    statusCode: 200,
    body: {
      message: 'Stan says hi!'
    }
  };
});
