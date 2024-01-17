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

const { startGlobalAgent, stopGlobalAgent } = require('./globalAgent');
const isCI = require('@instana/core/test/test_util/is_ci');
const fs = require('fs');

exports.mochaHooks = {
  async beforeAll() {
    this.timeout(20 * 1000);
    // eslint-disable-next-line no-console
    console.log(`@instana/collector test suite starting at ${timestamp()}.`);
    await startGlobalAgent();
  },

  beforeEach() {
    this.timeout(10 * 1000);

    const testFile = this.currentTest.file;

    if (process.env.RUN_ESM) {
      const files = fs.readdirSync(testFile.split('/').slice(0, -1).join('/'));
      const esmApp = files.find(f => f.indexOf('.mjs') !== -1);

      if (!esmApp) {
        this.skip();
        return;
      }
    }

    if (isCI()) {
      // Troubleshooting issues on CI often involves timing-based questions like:
      // * Why was this test application not able to connect to the database container? Did the DB container take too
      //   long to start up?
      // * Why has this CircleCI executor been killed during npm install before tests even started?
      //
      // Answering these questions is made a lot harder than necessary due to the lack of timestamps in the test output.
      // This hook will print the current time at the start of each test, hopefully aiding troubleshooting these pesky
      // flaky CI tests.

      // eslint-disable-next-line no-console
      console.log(`${this.currentTest.title} -- ${timestamp()}`);
    }
  },

  async afterAll() {
    this.timeout(10 * 1000);

    await stopGlobalAgent();
  }
};

function timestamp() {
  const d = new Date();
  return `UTC: ${d.toISOString()} (${d.getTime()})`;
}
