/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const mocha = require('mocha');
const { EVENT_TEST_FAIL } = mocha.Runner.constants;

module.exports = function failureReporter(runner) {
  runner.on(EVENT_TEST_FAIL, async (test, err) => {
    // eslint-disable-next-line no-console
    console.log(`##### Test failed: ${err}`);
    // eslint-disable-next-line no-console
    console.log(`##### Error stack: ${err.stack}`);

    // Exit early. CI will retry the whole test group.
    process.exit(1);
  });
};
