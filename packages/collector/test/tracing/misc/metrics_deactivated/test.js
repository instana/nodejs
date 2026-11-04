/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const expect = require('chai').expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;

const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/metrics_deactivated', function () {
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('when tracing is enabled', function () {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
          INSTANA_DISABLE_METRICS: 'true',
          INSTANA_DEBUG: 'true'
        }
      });

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedData();
    });

    after(async () => {
      await controls.stop();
    });

    it('should still trace spans', async () => {
      const response = await controls.sendRequest({
        method: 'POST',
        path: '/create-spans'
      });

      expect(response.message).to.equal('OK');
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        expect(spans.length).to.equal(2);
      });
    });
  });
});
