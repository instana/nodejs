/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const { retry } = require('@_local/core/test/test_util');

module.exports = function () {
  describe('tracing/cjs-via-esm', function () {
    this.timeout(1000 * 60);
    globalAgent.setUpCleanUpHooks();

    let controls;
    const agentControls = globalAgent.instance;

    before(async () => {
      const collectorRoot = path.dirname(require.resolve('@_local/collector/package.json'));

      controls = new ProcessControls({
        useGlobalAgent: true,
        dirname: __dirname,
        enableOtelIntegration: true,
        execArgv: ['--import', `${collectorRoot}/esm-register.mjs`]
      });

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    it('must trace', async () => {
      await controls.sendRequest({
        path: '/trigger'
      });

      return retry(async () => {
        const spans = await agentControls.getSpans();

        expect(spans.length).to.equal(4);

        const pinoSpan = spans.find(span => span.n === 'log.pino');
        expect(pinoSpan).to.exist;

        const httpServerSpan = spans.find(span => span.n === 'node.http.server');
        expect(httpServerSpan).to.exist;

        const httpClientSpan = spans.find(span => span.n === 'node.http.client');
        expect(httpClientSpan).to.exist;
        expect(httpClientSpan.data).to.exist;
      });
    });
  });
};
