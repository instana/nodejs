/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const mocha = require('mocha');
const { EVENT_TEST_RETRY } = mocha.Runner.constants;

module.exports = function RetryReporter(runner) {
  runner.on(EVENT_TEST_RETRY, test => {
    // eslint-disable-next-line no-console
    console.log(
      `Retrying test after failure: ${test.titlePath().join('::')} (retry ${test.currentRetry() + 1}/${test.retries()})`
    );
  });
};
