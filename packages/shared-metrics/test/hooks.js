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

const { startGlobalAgent, stopGlobalAgent } = require('@_local/collector/test/globalAgent');
const config = require('@_local/core/test/config');

exports.mochaHooks = {
  async beforeAll() {
    this.timeout(config.getTestTimeout());
    await startGlobalAgent();
  },

  async afterAll() {
    await stopGlobalAgent();
  }
};
