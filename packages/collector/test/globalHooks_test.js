/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
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

const { execSync } = require('child_process');
const path = require('path');

before(startGlobalAgent);

after(stopGlobalAgent);

beforeEach(checkPino);
afterEach(checkPino);

function checkPino() {
  const cwd = path.join(__dirname, '..', '..', '..', 'node_modules');
  const cmd = 'ls -la pino-v7';

  // eslint-disable-next-line no-console
  console.log(`Running ${cmd} in ${cwd}.`);
  try {
    const cmdOutput = execSync(cmd, { cwd });
    // eslint-disable-next-line no-console
    console.log(`Ran ${cmd} in ${cwd}:\n${cmdOutput}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e.code, e.message);
  }
}
