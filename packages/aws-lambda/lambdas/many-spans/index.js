/*
 * (c) Copyright IBM Corp. 2024
 */

/* eslint-disable indent, import/order, no-console, no-await-in-loop */

'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies
const instana = require('@instana/aws-lambda');

const delay = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const DELAY = process.env.DELAY || 100;
const ITERATIONS = process.env.ITERATIONS || 100;

// exports.handler = instana.wrap(async () => {
//   console.log('Running handler.');

//   for (let i = 0; i < ITERATIONS; i++) {
//     await instana.sdk.async.startExitSpan(`custom-span ${i}`);
//     await delay(DELAY);
//     instana.sdk.async.completeExitSpan();
//   }

//   return {
//     body: {
//       message: 'Stan says hi!'
//     }
//   };
// });
exports.handler = async () => {
  console.log('Running handler.');

  for (let i = 0; i < ITERATIONS; i++) {
    await instana.sdk.async.startExitSpan(`custom-span ${i}`);
    await delay(DELAY);
    instana.sdk.async.completeExitSpan();
  }

  return {
    body: {
      message: 'Stan says hi!'
    }
  };
};
