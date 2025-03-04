/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable no-await-in-loop */

'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies
const instana = require('@instana/aws-lambda');

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.handler = instana.wrap(async () => {
  for (let i = 0; i < 10; i++) {
    await instana.sdk.promise.startExitSpan('custom-span');
    await timeout(500);
    instana.sdk.promise.completeExitSpan();
  }

  const response = {
    statusCode: 200,
    body: JSON.stringify('OK')
  };
  return response;
});
