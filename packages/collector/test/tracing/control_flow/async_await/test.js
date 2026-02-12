/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');

describe('tracing/asyncAwait', function () {
  this.timeout(config.getTestTimeout());

  const expressAsyncAwaitControls = require('./controls');
  const { AgentStubControls } = require('../../../apps/agentStubControls');
  const expressControls = require('../../../apps/expressControls');

  const agentStubControls = new AgentStubControls();

  describe('custom http client wrapper with native promises', () => {
    before(async () => {
      await agentStubControls.startAgent();
      await expressControls.start({ agentControls: agentStubControls });
      await expressAsyncAwaitControls.start({ agentControls: agentStubControls, expressControls });
    });

    beforeEach(async () => {
      await agentStubControls.clearReceivedData();
    });

    after(async () => {
      await agentStubControls.stopAgent();
      await expressControls.stop();
      await expressAsyncAwaitControls.stop();
    });

    it('must follow async control flow', async () => {
      await expressAsyncAwaitControls.sendRequest();

      await testUtils.retry(async () => {
        const spans = await agentStubControls.getSpans();

        expect(spans.length).to.equal(5, 'Expecting five spans');

        const rootSpan = testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.k).to.equal(constants.ENTRY),
          span => expect(span.data.http.url).to.match(/\/getSomething/),
          span => expect(span.f.e).to.equal(String(expressAsyncAwaitControls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid')
        ]);

        const client1Span = testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.client'),
          span => expect(span.p).to.equal(rootSpan.s),
          span => expect(span.k).to.equal(constants.EXIT),
          span => expect(span.f.e).to.equal(String(expressAsyncAwaitControls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.data.http.url).to.have.string('/foo')
        ]);

        testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.k).to.equal(constants.ENTRY),
          span => expect(span.p).to.equal(client1Span.s),
          span => expect(span.f.e).to.equal(String(expressControls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid')
        ]);

        const client2Span = testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.client'),
          span => expect(span.p).to.equal(rootSpan.s),
          span => expect(span.k).to.equal(constants.EXIT),
          span => expect(span.f.e).to.equal(String(expressAsyncAwaitControls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.data.http.url).to.have.string('/bar')
        ]);

        testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.p).to.equal(client2Span.s),
          span => expect(span.k).to.equal(constants.ENTRY),
          span => expect(span.f.e).to.equal(String(expressControls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid')
        ]);
      });
    });
  });
});
