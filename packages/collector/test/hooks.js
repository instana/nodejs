/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

// This file defines global (root level) before and after hooks, see https://mochajs.org/#root-hook-plugins.
// This module needs to be pre-required via Mocha's --require parameter when running the tests in this package. The npm
// scripts for running tests take care of that.
//
// The globalAgent module manages an agent stub instance that can be used globally for all tests.
const path = require('path');
const isCI = require('@_local/core/test/test_util/is_ci');
const config = require('@_local/core/test/config');
const { checkESMApp } = require('@_local/core/test/test_util');

exports.mochaHooks = {
  async beforeAll() {
    // NOTE: mocha --watch has a bug (https://github.com/mochajs/mocha/issues/5149)
    //       We manually clear the file from the cache here.
    const globalAgentModulePath = path.resolve(__dirname, './globalAgent');
    delete require.cache[globalAgentModulePath];

    const { startGlobalAgent } = require('./globalAgent');

    // eslint-disable-next-line no-console
    console.log(`@instana/collector test suite starting at ${timestamp()}.`);
    this.timeout(config.getTestTimeout());

    await startGlobalAgent();
  },

  beforeEach() {
    const testFile = this.currentTest.file;

    if (process.env.RUN_ESM) {
      const folderPath = path.dirname(testFile);
      const esmApp = checkESMApp({ dirPath: folderPath });

      if (!esmApp) {
        this.skip();
        return;
      }
    }

    if (isCI()) {
      // Troubleshooting issues on CI often involves timing-based questions like:
      // * Why was this test application not able to connect to the database container? Did the DB container take too
      //   long to start up?
      // * Why has this CI task been killed during npm install before tests even started?
      //
      // Answering these questions is made a lot harder than necessary due to the lack of timestamps in the test output.
      // This hook will print the current time at the start of each test, hopefully aiding troubleshooting these pesky
      // flaky CI tests.

      // eslint-disable-next-line no-console
      console.log(`${this.currentTest.title} -- ${timestamp()}`);
    }
  },

  async afterAll() {
    // NOTE: mocha --watch has a bug (https://github.com/mochajs/mocha/issues/5149)
    //       We manually clear the file from the cache here.
    const globalAgentModulePath = path.resolve(__dirname, './globalAgent');
    delete require.cache[globalAgentModulePath];

    const { stopGlobalAgent } = require('./globalAgent');

    // eslint-disable-next-line no-console
    console.log(`@instana/collector test suite stopping at ${timestamp()}.`);
    this.timeout(config.getTestTimeout());
    await stopGlobalAgent();
  }
};

function timestamp() {
  const d = new Date();
  return `UTC: ${d.toISOString()} (${d.getTime()})`;
}
