/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// This file defines global (root level) before and after hooks, see https://mochajs.org/#root-level-hooks. When we
// move on to Mocha 8, we should replace these with the root hook plug-in:
// https://mochajs.org/#root-hook-plugins
//
// However, as long as we run tests on Node.js 8 on CI, we cannot use Mocha 8.
//
// The module ../globalAgent manages the global profiler instance and makes it available to tests that need to access it.

// MAINTENANCE NOTICE: This module MUST NOT be required by any other module, otherwise the global hooks defined here
// will not be executed.

const AutoProfiler = require('../lib/auto_profiler').AutoProfiler;

beforeEach(() => {
  global.profiler = new AutoProfiler();

  global.profiler.sendProfiles = function (profiles, callback) {
    // eslint-disable-next-line no-console
    callback();
  };

  global.profiler.getExternalPid = function () {
    return '123';
  };

  global.profiler.start({
    debug: true,
    disableTimers: true
  });
});

afterEach(() => {
  global.profiler.destroy();
  global.profiler = undefined;
});
