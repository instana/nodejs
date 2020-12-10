'use strict';

// This module manages the global agent stub, that is, the agent that is kept running during the whole test suite.
// Individual sub suites/tests can opt in to use this global instance or start and stop an agent stub on their own,
// depending on their requirements. Using the global instance is preferred as it decreases the duration of the
// @instana/collector test suite as a whole.
//
// The module ../globalHooks_test sets up the global Mocha hooks that make sure the agent is started before running the
// test suite and stopped afterwards.

const { AgentStubControls } = require('./apps/agentStubControls');

exports.PORT = 3211;

exports.instance = new AgentStubControls(exports.PORT);

exports.startGlobalAgent = function start() {
  return exports.instance.startAgent({
    // The "global" agent (that keeps running during the whole test suite) uses port 3211. Individual suites/tests
    // that start an agent themselves and tear it down afterwards use 3210.
    extraHeaders: [
      //
      'X-My-Exit-Options-Request-Header',
      'X-My-Exit-Options-Request-Multi-Header',
      'X-My-Exit-Set-On-Request-Header',
      'X-My-Exit-Set-On-Request-Multi-Header',
      'X-My-Exit-Response-Header'
    ]
  });
};

exports.stopGlobalAgent = function start() {
  return exports.instance.stopAgent();
};

/**
 * Shorthand for setUpSuiteCleanUpHooks and setUpTestCaseCleanUpHooks.
 */
exports.setUpCleanUpHooks = function setUpCleanUpHooks() {
  exports.setUpSuiteCleanUpHooks();
  exports.setUpTestCaseCleanUpHooks();
};

/**
 * Discard all data (including announced processed, known PIDs, metrics etc.) once before and after a test suite. Call
 * this in the outermost describe in test suites that use the global agent.
 */
exports.setUpSuiteCleanUpHooks = function setUpSuiteCleanUpHooks() {
  before(() => exports.instance.reset());
  after(() => exports.instance.reset());
};

/**
 * Discard spans (and also profiles) before and after each test. Call this in the outermost describe in test suites that
 * use the global agent.
 */
exports.setUpTestCaseCleanUpHooks = function setUpTestCaseCleanUpHooks() {
  beforeEach(() => exports.instance.clearReceivedData());
  afterEach(() => exports.instance.clearReceivedData());
};
