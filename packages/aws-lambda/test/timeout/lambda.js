/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable no-console */

'use strict';

const instana = require('../..');

const delay = require('@_local/core/test/test_util/delay');

if (!process.env.DELAY) {
  throw new Error('This Lambda requires the environment variable DELAY to be set.');
}

exports.handler = instana.wrap(async () => {
  console.log(`Lambda handler started, now waiting ${process.env.DELAY} milliseconds.`);
  await delay(process.env.DELAY);
  console.log('Lambda handler finished');

  return {
    body: {
      message: 'Stan says hi!'
    }
  };
});
