/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/* eslint-disable indent, import/order, no-console */

'use strict';

// Ths is aws-lambda!
const instana = require('../..');

const { consoleLogger: serverlessLogger } = require('@_local/serverless');
const delay = require('../../../core/test/test_util/delay');

exports.handler = instana.wrap(async () => {
  console.warn('this is a warning');
  console.error('this is an error');

  // NOTE: Is never captured, because aws-lambda package initialises serverless first and then core.
  //       That means the console logger in serverless is never instrumented.
  serverlessLogger.getLogger().warn('Meh');

  await delay(2000);

  return {
    body: {
      message: 'Hi from Lambda!'
    }
  };
});
