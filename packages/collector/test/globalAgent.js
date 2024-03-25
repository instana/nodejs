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
exports.instance = new AgentStubControls();

exports.startGlobalAgent = function start() {
  return exports.instance.startAgent({
    extraHeaders: [
      //
      'X-My-Exit-Options-Request-Header',
      'X-My-Exit-Options-Request-Multi-Header',
      'X-My-Exit-Set-On-Request-Header',
      'X-My-Exit-Set-On-Request-Multi-Header',
      'X-My-Exit-Request-Object-Request-Header',
      'X-My-Exit-Request-Object-Request-Multi-Header',
      'X-My-Exit-Response-Header',

      // For packages/collector/test/tracing/misc/specification_compliance/
      'X-Request-Header-Test-To-App',
      'X-Response-Header-App-To-Test',
      'X-Request-Header-App-To-Downstream',
      'X-Response-Header-Downstream-To-App'
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
