/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { retry, delay } = require('../../../../../core/test/test_util');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/sdk/opt_in', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  beforeEach(async () => {
    await globalAgent.instance.clearReceivedTraceData();
  });

  describe('APP WITH SDK', function () {
    let agentControls;

    before(async () => {
      agentControls = new ProcessControls({
        appPath: path.join(__dirname, 'app_with_sdk'),
        useGlobalAgent: true
      });

      await agentControls.start(null, null, true);
    });

    after(async () => {
      await agentControls.stop();
    });

    it('should collect spans including sdk wrap', async () => {
      await delay(100);

      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        expect(spans.length).to.equal(2);
      });
    });
  });

  describe('APP WITHOUT SDK', function () {
    let agentControls;

    before(async () => {
      agentControls = new ProcessControls({
        appPath: path.join(__dirname, 'app_without_sdk'),
        useGlobalAgent: true
      });

      await agentControls.start(null, null, true);
    });

    after(async () => {
      await agentControls.stop();
    });

    it('should trace single exit span only', async () => {
      await delay(100);

      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        expect(spans.length).to.equal(1);
      });
    });
  });
});
