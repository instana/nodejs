/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

/* eslint-disable no-await-in-loop */

// eslint-disable-next-line import/no-extraneous-dependencies
const instana = require('@instana/aws-lambda');

const MAX_DELAY = 905000;

function delay(ms) {
  if (ms > MAX_DELAY) {
    // Max Lambda timeout is 900 seconds, longer timeouts do not make much sense.
    console.warn(`Restricting requested delay of ${ms} to ${MAX_DELAY}.`);
    ms = MAX_DELAY;
  }

  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.handler = instana.wrap(async (event, context) => {
  console.log(`starting handler for event: ${JSON.stringify(event)}`);
  console.log('context.memoryLimitInMB', context.memoryLimitInMB);
  console.log('process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE', process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);

  if (event.triggerOom || event.oomIterations || event.oomChunksize) {
    await triggerOom(event);
  } else if (event.delay) {
    await delay(event.delay);
  }
  console.log('Done');
  return {
    message: 'Done.'
  };
});

const growingArray = [];

async function triggerOom(event) {
  const oomIterations = event.oomIterations || Number.MAX_VALUE;
  const oomChunksize = event.oomChunksize || 1e6;
  const oomPause = event.oomPause || 250;
  console.log(`Filling memory ${oomIterations} times with chunks of size ${oomChunksize}.`);
  for (let i = 0; i < oomIterations; i++) {
    await consumeMemoryAndLog(i, oomChunksize);
    await delay(oomPause);
  }
}

function consumeMemoryAndLog(iteration, chunkSize) {
  logMemoryUsage(`before ${iteration}`);
  growingArray.push(Array(chunkSize).fill('some string'));
  logMemoryUsage(`after ${iteration}`);
}

function logMemoryUsage(label) {
  const usage = process.memoryUsage();
  console.log(label, usage);
  Object.keys(usage).forEach(key => {
    console.log(label, `${key}: ${Math.round((usage[key] / 1024 / 1024) * 100) / 100} MB`);
  });
}
