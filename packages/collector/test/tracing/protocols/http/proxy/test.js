/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const expect = require('chai').expect;
const Promise = require('bluebird');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const { expectAtLeastOneMatching, retry } = require('../../../../../../core/test/test_util');
const globalAgent = require('../../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('http with proxy', function() {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const expressProxyControls = require('./expressProxyControls');
  const expressControls = require('../../../../apps/expressControls');

  expressProxyControls.registerTestHooks({ useGlobalAgent: true });
  expressControls.registerTestHooks({ useGlobalAgent: true });

  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid()));
  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));

  describe('httpClient', () => {
    it('must stitch together HTTP server -> client -> server calls', () =>
      expressProxyControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          responseStatus: 201
        })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(3, 'Expecting at most three spans');

              // proxy entry span
              const proxyEntrySpan = expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.f.e).to.equal(String(expressProxyControls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.async).to.not.exist,
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(0),
                span => expect(span.data.http.method).to.equal('POST'),
                span => expect(span.data.http.url).to.equal('/checkout'),
                span => expect(span.data.http.status).to.equal(201)
              ]);

              // proxy exit span
              const proxyExitSpan = expectAtLeastOneMatching(spans, [
                span => expect(span.t).to.equal(proxyEntrySpan.t),
                span => expect(span.p).to.equal(proxyEntrySpan.s),
                span => expect(span.n).to.equal('node.http.client'),
                span => expect(span.f.e).to.equal(String(expressProxyControls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.async).to.not.exist,
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(0),
                span => expect(span.data.http.method).to.equal('POST'),
                span => expect(span.data.http.url).to.equal('http://localhost:3213/proxy-call/checkout'),
                span => expect(span.data.http.status).to.equal(201)
              ]);

              expectAtLeastOneMatching(spans, [
                span => expect(span.t).to.equal(proxyEntrySpan.t),
                span => expect(span.p).to.equal(proxyExitSpan.s),
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.f.e).to.equal(String(expressControls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.async).to.not.exist,
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(0),
                span => expect(span.data.http.method).to.equal('POST'),
                span => expect(span.data.http.url).to.equal('/proxy-call/checkout'),
                span => expect(span.data.http.status).to.equal(201)
              ]);
            })
          )
        ));

    it('must support node-fetch', () =>
      expressProxyControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          responseStatus: 200,
          httpLib: 'node-fetch'
        })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans.length).to.equal(3, 'Expecting at most three spans');

              // proxy entry span
              const proxyEntrySpan = expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.f.e).to.equal(String(expressProxyControls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.async).to.not.exist,
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(0),
                span => expect(span.data.http.method).to.equal('POST'),
                span => expect(span.data.http.url).to.equal('/checkout'),
                span => expect(span.data.http.status).to.equal(200)
              ]);

              // proxy exit span
              const proxyExitSpan = expectAtLeastOneMatching(spans, [
                span => expect(span.t).to.equal(proxyEntrySpan.t),
                span => expect(span.p).to.equal(proxyEntrySpan.s),
                span => expect(span.n).to.equal('node.http.client'),
                span => expect(span.f.e).to.equal(String(expressProxyControls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.async).to.not.exist,
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(0),
                span => expect(span.data.http.method).to.equal('POST'),
                span => expect(span.data.http.url).to.equal('http://localhost:3213/proxy-call/checkout'),
                span => expect(span.data.http.status).to.equal(200)
              ]);

              expectAtLeastOneMatching(spans, [
                span => expect(span.t).to.equal(proxyEntrySpan.t),
                span => expect(span.p).to.equal(proxyExitSpan.s),
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.f.e).to.equal(String(expressControls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.async).to.not.exist,
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(0),
                span => expect(span.data.http.method).to.equal('POST'),
                span => expect(span.data.http.url).to.equal('/proxy-call/checkout'),
                span => expect(span.data.http.status).to.equal(200)
              ]);
            })
          )
        ));

    // TODO check client test for a test that verifies that supression is propagated
    it('must not generate traces when the suppression header is set', () =>
      expressProxyControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          responseStatus: 503,
          suppressTracing: true
        })
        .then(Promise.delay(200))
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(0, `Spans: ${JSON.stringify(spans, 0, 2)}`);
            })
          )
        ));

    it('must trace requests to non-existing targets', () =>
      expressProxyControls
        .sendRequest({
          method: 'POST',
          path: '/callNonExistingTarget',
          responseStatus: 503,
          target: 'http://10.123.456.555:49162/foobar'
        })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.client'),
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(1),
                span => expect(span.f.e).to.equal(String(expressProxyControls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.async).to.not.exist,
                span => expect(span.data.http.error).to.be.a('string'),
                span => expect(span.data.http.method).to.equal('POST'),
                span => expect(span.data.http.url).to.equal('http://10.123.456.555:49162/foobar')
              ]);
            })
          )
        ));

    it('must not explode when asked to request a malformed url', () =>
      expressProxyControls
        .sendRequest({
          method: 'POST',
          path: '/callInvalidUrl',
          responseStatus: 503,
          target: '://127.0.0.555:49162/foobar'
        })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(1);

              expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(1)
              ]);
            })
          )
        ));
  });

  it('must support tracing of concurrent calls', () => {
    const callsNumbers = [];
    for (let i = 0; i < 20; i++) {
      callsNumbers.push(i);
    }

    const calls = Promise.all(
      callsNumbers.map(call =>
        expressProxyControls.sendRequest({
          method: 'POST',
          path: `/call-${call}`,
          responseStatus: (call % 20) + 200,
          delay: 10
        })
      )
    );

    return calls.then(() =>
      retry(() =>
        agentControls.getSpans().then(spans => {
          callsNumbers.forEach(call => {
            const proxyEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(expressProxyControls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal(`/call-${call}`),
              span => expect(span.data.http.status).to.equal((call % 20) + 200)
            ]);

            // proxy exit span
            const proxyExitSpan = expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(proxyEntrySpan.t),
              span => expect(span.p).to.equal(proxyEntrySpan.s),
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.f.e).to.equal(String(expressProxyControls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal(`http://localhost:3213/proxy-call/call-${call}`),
              span => expect(span.data.http.status).to.equal((call % 20) + 200)
            ]);

            expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(proxyEntrySpan.t),
              span => expect(span.p).to.equal(proxyExitSpan.s),
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(expressControls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal(`/proxy-call/call-${call}`),
              span => expect(span.data.http.status).to.equal((call % 20) + 200)
            ]);
          });
        })
      )
    );
  });
});
