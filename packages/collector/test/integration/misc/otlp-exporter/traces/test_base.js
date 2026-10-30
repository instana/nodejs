/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');

const testConfig = require('@_local/core/test/config');
const { retry } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const mochaSuiteFn = testConfig.getTestTimeout() > 0 ? describe : describe.skip;

module.exports = function () {
  mochaSuiteFn('OTLP format', function () {
    this.timeout(testConfig.getTestTimeout());

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    let controls;

    const startApp = async (extra = {}) => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        ...extra
      });

      await controls.startAndWaitForAgentConnection();
    };

    const getSpans = () =>
      retry(() =>
        agentControls.getSpans().then(spans => {
          expect(spans).to.be.an('array');
          expect(spans.length).to.be.at.least(1);
          return spans;
        })
      );

    before(async () => {
      await startApp({ env: { OTLP_ENABLED_IN_CODE: 'true' } });
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    it('should send spans in OTLP format when enabled via code configuration', () =>
      controls.sendRequest({ method: 'GET', path: '/otlp-format' }).then(async () => {
        const spans = await getSpans();

        const otlp = spans[0];
        const resourceSpan = otlp.resourceSpans[0];

        expect(resourceSpan.resource.attributes.find(a => a.key === 'service.name')?.value.stringValue).to.equal(
          'instana-collector-test-otlp'
        );

        const span = resourceSpan.scopeSpans[0].spans[0];

        expect(span.name).to.equal('GET /otlp-format');
        expect(span.kind).to.equal(2);

        const httpMethod = span.attributes.find(a => a.key === 'http.method');

        expect(httpMethod.value.stringValue).to.equal('GET');
      }));

    it('should send spans in Instana format when OTLP is disabled', async () => {
      const disabled = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true
      });

      await disabled.startAndWaitForAgentConnection();
      await agentControls.clearReceivedTraceData();

      try {
        await disabled.sendRequest({ method: 'GET', path: '/otlp-format' });

        const spans = await getSpans();

        const httpSpan = spans.find(s => s.n === 'node.http.server');

        expect(httpSpan).to.exist;
        expect(httpSpan.data.http.method).to.equal('GET');
        expect(httpSpan.data.http.url).to.equal('/otlp-format');

        expect(spans[0].resourceSpans).to.not.exist;
      } finally {
        await disabled.stop();
      }
    });

    it('should send spans in OTLP format when enabled via environment variable', async () => {
      const env = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: { INSTANA_TRACING_OTLP_ENABLED: 'true' }
      });

      await env.startAndWaitForAgentConnection();
      await agentControls.clearReceivedTraceData();

      try {
        await env.sendRequest({ method: 'GET', path: '/otlp-format' });

        const spans = await getSpans();
        expect(spans[0].resourceSpans).to.be.an('array');
      } finally {
        await env.stop();
      }
    });

    it('should send spans in OTLP format when enabled by agent configuration', async () => {
      const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');

      const customAgentControls = new AgentStubControls();

      await customAgentControls.startAgent({
        otlpExporter: { enabled: true }
      });
      const cfg = new ProcessControls({
        agentControls: customAgentControls,
        dirname: __dirname
      });

      await cfg.startAndWaitForAgentConnection();

      await new Promise(resolve => setTimeout(resolve, 500));

      await customAgentControls.clearReceivedTraceData();

      try {
        await cfg.sendRequest({ method: 'GET', path: '/otlp-format' });

        await retry(async () => {
          const spans = await customAgentControls.getSpans();

          expect(spans).to.be.an('array');
          expect(spans.length).to.be.at.least(1);

          const otlpPayload = spans[0];

          expect(otlpPayload.resourceSpans).to.be.an('array');
          expect(otlpPayload.resourceSpans.length).to.be.at.least(1);

          const resourceSpan = otlpPayload.resourceSpans[0];

          expect(resourceSpan.resource).to.exist;
          expect(resourceSpan.scopeSpans).to.be.an('array');
          expect(resourceSpan.scopeSpans[0].spans).to.be.an('array');
          expect(resourceSpan.scopeSpans[0].spans.length).to.be.at.least(1);
        });
      } finally {
        await cfg.stop();
        await customAgentControls.stopAgent();
      }
    });
  });
};
