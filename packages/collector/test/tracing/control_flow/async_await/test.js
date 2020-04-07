'use strict';

const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');

describe('tracing/asyncAwait', function() {
  if (!semver.satisfies(process.versions.node, '>= 8.2.1')) {
    return;
  }

  const expressAsyncAwaitControls = require('./controls');
  const agentStubControls = require('../../../apps/agentStubControls');
  const expressControls = require('../../../apps/expressControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks();

  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));

  describe('custom http client wrapper with native promises', () => {
    expressAsyncAwaitControls.registerTestHooks({
      upstreamPort: expressControls.appPort
    });

    beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressAsyncAwaitControls.getPid()));

    testAsyncControlFlow();
  });

  describe('request-promise', () => {
    expressAsyncAwaitControls.registerTestHooks({
      upstreamPort: expressControls.appPort,
      useRequestPromise: true
    });

    beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressAsyncAwaitControls.getPid()));

    testAsyncControlFlow();
  });

  function testAsyncControlFlow() {
    it('must follow async control flow', () =>
      expressAsyncAwaitControls.sendRequest().then(() =>
        testUtils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            expect(spans.length).to.equal(5, 'Expecting five spans');

            const rootSpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.data.http.url).to.match(/\/getSomething/);
              expect(span.f.e).to.equal(String(expressAsyncAwaitControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });

            const client1Span = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.p).to.equal(rootSpan.s);
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressAsyncAwaitControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.data.http.url).to.have.string('/foo');
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.p).to.equal(client1Span.s);
              expect(span.f.e).to.equal(String(expressControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });

            const client2Span = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.client');
              expect(span.p).to.equal(rootSpan.s);
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(expressAsyncAwaitControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.data.http.url).to.have.string('/bar');
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.p).to.equal(client2Span.s);
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.f.e).to.equal(String(expressControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });
          })
        )
      ));
  }
});
