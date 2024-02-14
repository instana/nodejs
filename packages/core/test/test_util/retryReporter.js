/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const mocha = require('mocha');
const { EVENT_TEST_RETRY } = mocha.Runner.constants;

module.exports = function RetryReporter(runner) {
  runner.on(EVENT_TEST_RETRY, async (test, err) => {
    // eslint-disable-next-line no-console
    console.log(`##### Test failed: ${err}`);
    // eslint-disable-next-line no-console
    console.log(`##### Error stack: ${err.stack}`);

    // eslint-disable-next-line no-console
    console.log(
      `##### Retrying after failure: ${test.titlePath().join('::')} (retry ${
        test.currentRetry() + 1
      }/${test.retries()})`
    );
  });
};
