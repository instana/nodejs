/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

// This file defines global (root level) before and after hooks, see https://mochajs.org/#root-level-hooks. When we
// move on to Mocha 8, we should replace these with the root hook plug-in:
// https://mochajs.org/#root-hook-plugins
//
// However, as long as we run tests on Node.js 8 on CI, we cannot use Mocha 8.
//
// The module ../globalAgent manages the actual agent instance and makes it available to tests that need to access it.

// MAINTENANCE NOTICE: This module MUST NOT be required by any other module, otherwise the global hooks defined here
// will not be executed.

const { startGlobalAgent, stopGlobalAgent } = require('./globalAgent');

before(startGlobalAgent);

after(stopGlobalAgent);
