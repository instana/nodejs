/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

exports.exchange = 'instana-test-exchange';
exports.queueName = 'instana-test-queue';
exports.queueNameGet = 'instana-test-queue-get';
exports.queueNameConfirm = 'instana-test-queue-confirm';

exports.bail = function bail(err) {
  console.error(err);
  process.exit(1);
};
