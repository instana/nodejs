/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { expect } = require('chai');
const gcStats = require('../src/gc');
const nativeModuleRetry = require('../src/util/nativeModuleRetry');
const { createFakeLogger } = require('@instana/core/test/test_util');
const config = require('@instana/core/test/config');

describe('shared-metrics/memory_leak_detector', function () {
  this.timeout(config.getTestTimeout() * 2);

  before(() => {
    process.env.NODE_NO_WARNINGS = '0';
  });

  after(() => {
    delete process.env.NODE_NO_WARNINGS;
  });

  it('gc.js: should not throw memory leak', async () => {
    let warningAppeared = false;

    process.on('warning', () => {
      warningAppeared = true;
    });

    nativeModuleRetry.init({
      logger: createFakeLogger()
    });
    gcStats.init({ logger: createFakeLogger() });

    await new Promise(resolve => setTimeout(resolve, 1000));

    for (let i = 0; i <= 15; i++) {
      gcStats.activate();

      // agent announce cycle calls deactivate
      gcStats.deactivate();
    }

    await new Promise(resolve => setTimeout(resolve, 3 * 1000));

    expect(warningAppeared).to.be.false;
  });
});
