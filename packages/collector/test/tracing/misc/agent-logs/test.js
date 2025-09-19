/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { expect } = require('chai');
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const agentControls = globalAgent.instance;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/agent logs', function () {
  this.timeout(config.getTestTimeout());
  globalAgent.setUpCleanUpHooks();

  describe('Ensure agent logs are transmitted', function () {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true
      });

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    it('expect agent logs data', async () => {
      await controls.sendRequest({
        path: '/trace'
      });

      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        const agentLogs = await agentControls.getAgentLogs();

        expect(spans.length).to.equal(2);
        expect(agentLogs.length).to.equal(9);
      });
    });
  });
});
