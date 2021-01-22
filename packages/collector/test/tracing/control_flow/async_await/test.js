/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2017
 */

'use strict';

const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');

const mochaSuiteFn = semver.satisfies(process.versions.node, '>= 8.2.1') ? describe : describe.skip;

mochaSuiteFn('tracing/asyncAwait', function() {
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
          })
        )
      ));
  }
});
