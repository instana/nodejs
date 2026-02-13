/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// This file defines global (root level) before and after hooks, see https://mochajs.org/#root-hook-plugins.
// This module needs to be pre-required via Mocha's --require parameter when running the tests in this package. The npm
// scripts for running tests take care of that.
//
// In particular, these hook sets up the global profiler instance that is used in some tests.

const AutoProfiler = require('../lib/auto_profiler').AutoProfiler;
const config = require('@_local/core/test/config');

exports.mochaHooks = {
  beforeEach() {
    this.timeout(config.getTestTimeout());

    global.profiler = new AutoProfiler();

    global.profiler.sendProfiles = function (profiles, callback) {
      callback();
    };

    global.profiler.getExternalPid = function () {
      return '123';
    };

    global.profiler.start({
      debug: true,
      disableTimers: true
    });
  },

  afterEach() {
    this.timeout(config.getTestTimeout());
    global.profiler.destroy();
    global.profiler = undefined;
  }
};
