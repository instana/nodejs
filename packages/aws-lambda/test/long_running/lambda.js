/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable indent, import/order, no-console, no-await-in-loop */

'use strict';

const instana = require('../..');
const delay = require('@_local/core/test/test_util/delay');

const DELAY = process.env.DELAY || 1000;
const ITERATIONS = process.env.ITERATIONS || 10;

// In production, the package @instana/aws-lambda is located in
// /var/task/node_modules/@instana/aws-lambda/src/metrics while the main package.json of the Lambda is in
// /var/task/package.json. The assumption about the relative location does not hold in the tests, so we need to fix the
// assumed root dir of the Lambda.
require('../../src/metrics/rootDir').root = require('path').resolve(__dirname, '..', '..');

exports.handler = instana.wrap(async () => {
  console.log('in actual handler');

  for (let i = 0; i < ITERATIONS; i++) {
    await instana.sdk.async.startExitSpan('custom-span');
    await delay(DELAY);
    instana.sdk.async.completeExitSpan();
  }

  return {
    body: {
      message: 'Stan says hi!'
    }
  };
});
