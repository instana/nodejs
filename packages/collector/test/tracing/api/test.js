/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');
const { retry, expectExactlyOneMatching } = require('@_local/core/test/test_util');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/api', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('when tracing is enabled', () => {
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

    afterEach(async () => {
      await controls.clearIpcMessages();
    });
    it('must provide details for currently active span', async () => {
      const now = Date.now();
      const response = await controls.sendRequest({
        path: '/span/active'
      });

      // In contrast to other tests, we inspect the span from the response instead of the span that has been sent to
      // the agent. This is because this test verifies the result of span.currentSpan, and it does not modify the active
      // span (so we do not need to verify any modifications).
      const span = response.span;
      expect(span).to.exist;
      expect(span.traceId).to.be.not.null;
      expect(span.spanId).to.be.not.null;
      expect(span.parentSpanId).to.not.exist;
      expect(span.name).to.equal('node.http.server');
      expect(span.isEntry).to.be.true;
      expect(span.isExit).to.be.false;
      expect(span.isIntermediate).to.be.false;
      expect(span.timestamp).to.be.gte(now);
      expect(span.timestamp).to.be.lte(now + 1000);

      // The span is not yet completed when it is serialized.
      expect(span.duration).to.equal(0);
      expect(span.errorCount).to.equal(0);
      expect(span.handleConstructorName).to.equal('SpanHandle');
    });

    it('must annotate a nested value (path given as flat string)', async () => {
      await controls.sendRequest({
        path: '/span/annotate-path-flat-string'
      });
      await retry(async () => {
        const spans = await agentControls.getSpans();
        expectExactlyOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.data.sdk.custom.tags.key).to.equal('custom nested tag value'),
          span => expect(span.data.http.path_tpl).to.equal('/custom/{template}'),
          span => expect(span.data.redundant.dots).to.equal('will be silently dropped')
        ]);
      });
    });

    it('must annotate a nested value (path given as array)', async () => {
      await controls.sendRequest({
        path: '/span/annotate-path-array'
      });
      await retry(async () => {
        const spans = await agentControls.getSpans();
        expectExactlyOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.data.sdk.custom.tags.key).to.equal('custom nested tag value'),
          span => expect(span.data.http.path_tpl).to.equal('/custom/{template}')
        ]);
      });
    });

    it('must mark the current span as erroneous', async () => {
      await controls.sendRequest({
        path: '/span/mark-as-erroneous'
      });
      await retry(async () => {
        const spans = await agentControls.getSpans();
        expectExactlyOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.ec).to.equal(1)
        ]);
      });
    });

    it('must mark the current span as erroneous with a custom error message', async () => {
      await controls.sendRequest({
        path: '/span/mark-as-erroneous-custom-message'
      });
      await retry(async () => {
        const spans = await agentControls.getSpans();
        expectExactlyOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.ec).to.equal(1),
          span => expect(span.data.http.error).to.not.exist,
          span => expect(span.data.sdk.custom.tags.error).to.equal('custom error message')
        ]);
      });
    });

    it('must mark the current span as non-erroneous', async () => {
      await controls.sendRequest({
        path: '/span/mark-as-non-erroneous'
      });
      await retry(async () => {
        const spans = await agentControls.getSpans();
        expectExactlyOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.ec).to.equal(0),
          span => expect(span.data.http.error).to.not.exist
        ]);
      });
    });

    it('must manually end the currently active span', async () => {
      const now = Date.now();
      const response = await controls.sendRequest({
        path: '/span/manuallyended'
      });

      const spanFromResponse = response.span;
      expect(spanFromResponse).to.exist;
      expect(spanFromResponse.traceId).to.be.not.null;
      expect(spanFromResponse.spanId).to.be.not.null;
      expect(spanFromResponse.parentSpanId).to.not.exist;
      expect(spanFromResponse.name).to.equal('node.http.server');
      expect(spanFromResponse.isEntry).to.be.true;
      expect(spanFromResponse.isExit).to.be.false;
      expect(spanFromResponse.isIntermediate).to.be.false;
      expect(spanFromResponse.timestamp).to.be.gte(now);
      expect(spanFromResponse.timestamp).to.be.lte(now + 1000);
      expect(spanFromResponse.duration).to.be.gt(0);
      expect(spanFromResponse.errorCount).to.equal(42);

      await retry(async () => {
        const spans = await agentControls.getSpans();
        expectExactlyOneMatching(spans, [
          spanFromAgent => expect(spanFromAgent.n).to.equal('node.http.server'),
          spanFromAgent => expect(spanFromAgent.ts).to.be.gte(now),
          spanFromAgent => expect(spanFromAgent.ts).to.be.lte(now + 1000),
          spanFromAgent => expect(spanFromAgent.d).to.gt(0),
          spanFromAgent => expect(spanFromAgent.ec).to.equal(42)
        ]);
      });
    });
  });

  describe('when tracing is not enabled', () => {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        tracingEnabled: false
      });

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });
    after(async () => {
      await controls.stop();
    });

    afterEach(async () => {
      await controls.clearIpcMessages();
    });
    it('must provide a noop span handle', async () => {
      const response = await controls.sendRequest({
        path: '/span/active'
      });

      // In contrast to other tests, we inspect the span from the response instead of the span that has been sent to
      // the agent. This is because this test verifies the result of span.currentSpan. Also, tracing is disabled, so
      // no spans are sent to the agent anyway.
      const span = response.span;
      expect(span).to.exist;
      expect(span.traceId).to.be.null;
      expect(span.spanId).to.be.null;
      expect(span.parentSpanId).to.be.null;
      expect(span.name).to.be.null;
      expect(span.isEntry).to.be.false;
      expect(span.isExit).to.be.false;
      expect(span.isIntermediate).to.be.false;
      expect(span.timestamp).to.equal(0);
      expect(span.duration).to.equal(0);
      expect(span.errorCount).to.equal(0);
      expect(span.handleConstructorName).to.equal('NoopSpanHandle');
    });

    it('must do nothing when trying to manually end the currently active span', async () => {
      const response = await controls.sendRequest({
        path: '/span/manuallyended'
      });

      // In contrast to other tests, we inspect the span from the response instead of the span that has been sent to
      // the agent. This is because this test verifies the result of span.currentSpan. Also, tracing is disabled, so
      // no spans are sent to the agent anyway.
      const span = response.span;
      expect(span).to.exist;
      expect(span.traceId).to.be.null;
      expect(span.spanId).to.be.null;
      expect(span.parentSpanId).to.be.null;
      expect(span.name).to.be.null;
      expect(span.isEntry).to.be.false;
      expect(span.isExit).to.be.false;
      expect(span.isIntermediate).to.be.false;
      expect(span.timestamp).to.equal(0);
      expect(span.duration).to.equal(0);
      expect(span.errorCount).to.equal(0);
      expect(span.handleConstructorName).to.equal('NoopSpanHandle');
    });

    it('must do nothing when trying to annotate', async () => {
      const response = await controls.sendRequest({
        path: '/span/annotate-path-flat-string'
      });
      const span = response.span;
      expect(span).to.exist;
      expect(span.data).to.not.exist;
    });
  });
});
