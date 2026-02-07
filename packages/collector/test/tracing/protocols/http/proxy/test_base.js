/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const expect = require('chai').expect;
const Promise = require('bluebird');

const config = require('@_instana/core/test/config');
const { expectAtLeastOneMatching, retry } = require('@_instana/core/test/test_util');
const globalAgent = require('@_instana/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const commonEnv = {
    LIBRARY_LATEST: isLatest,
    LIBRARY_VERSION: version,
    LIBRARY_NAME: name
  };

  const expressProxyControls = require('./expressProxyControls');
  const expressControls = require('@_instana/collector/test/apps/expressControls');

  before(async () => {
    await expressControls.start({ useGlobalAgent: true, env: commonEnv });
    await expressProxyControls.start({ useGlobalAgent: true, expressControls, env: commonEnv });
  });

  after(async () => {
    await expressControls.stop();
    await expressProxyControls.stop();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

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
                span =>
                  expect(span.data.http.url).to.equal(
                    `http://localhost:${expressControls.getPort()}/proxy-call/checkout`
                  ),
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
          responseStatus: 200
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
                span =>
                  expect(span.data.http.url).to.equal(
                    `http://localhost:${expressControls.getPort()}/proxy-call/checkout`
                  ),
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
              span =>
                expect(span.data.http.url).to.equal(
                  `http://localhost:${expressControls.getPort()}/proxy-call/call-${call}`
                ),
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
};
