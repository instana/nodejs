/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

// This module manages the global agent stub, that is, the agent that is kept running during the whole test suite.
// Individual sub suites/tests can opt in to use this global instance or start and stop an agent stub on their own,
// depending on their requirements. Using the global instance is preferred as it decreases the duration of the
// @instana/collector test suite as a whole.
//
// The module ../globalHooks_test sets up the global Mocha hooks that make sure the agent is started before running the
// test suite and stopped afterwards.

const { AgentStubControls } = require('./apps/agentStubControls');

const agentPorts = {
  collector: 3211,
  'shared-metrics': 7211
};

const DEFAULT_PORT = 3211;

// The "global" agent (that keeps running during the whole test suite) in package collector uses port 3211.
// Individual suites/tests/ that start an agent themselves and tear it down afterwards use 3210. Other packages
// that use the global agent follow similar pattern, see test-suite-ports.md.
exports.PORT = DEFAULT_PORT;

const packageNames = Object.keys(agentPorts);
for (let i = 0; i < packageNames.length; i++) {
  const packageName = packageNames[i];
  if (process.cwd().indexOf(packageName) >= 0) {
    exports.PORT = agentPorts[packageName];
    break;
  }
}

exports.instance = new AgentStubControls(exports.PORT);

exports.startGlobalAgent = function start() {
  return exports.instance.startAgent({
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
