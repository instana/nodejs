'use strict';

const expect = require('chai').expect;
const Promise = require('bluebird');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const { expectAtLeastOneMatching, retry } = require('../../../../../../core/test/test_util');

describe('http with proxy', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const expressProxyControls = require('../../../../apps/expressProxyControls');
  const agentStubControls = require('../../../../apps/agentStubControls');
  const expressControls = require('../../../../apps/expressControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks();
  expressProxyControls.registerTestHooks();

  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));
  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid()));

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
            agentStubControls.getSpans().then(spans => {
              expect(spans.length).to.equal(3, 'Expecting at most three spans');

              // proxy entry span
              const proxyEntrySpan = expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.f.e).to.equal(String(expressProxyControls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(0);
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal('/checkout');
                expect(span.data.http.status).to.equal(201);
              });

              // proxy exit span
              const proxyExitSpan = expectAtLeastOneMatching(spans, span => {
                expect(span.t).to.equal(proxyEntrySpan.t);
                expect(span.p).to.equal(proxyEntrySpan.s);
                expect(span.n).to.equal('node.http.client');
                expect(span.f.e).to.equal(String(expressProxyControls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(0);
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal('http://localhost:3211/proxy-call/checkout');
                expect(span.data.http.status).to.equal(201);
              });

              expectAtLeastOneMatching(spans, span => {
                expect(span.t).to.equal(proxyEntrySpan.t);
                expect(span.p).to.equal(proxyExitSpan.s);
                expect(span.n).to.equal('node.http.server');
                expect(span.f.e).to.equal(String(expressControls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(0);
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal('/proxy-call/checkout');
                expect(span.data.http.status).to.equal(201);
              });
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
            agentStubControls.getSpans().then(spans => {
              expect(spans.length).to.equal(3, 'Expecting at most three spans');

              // proxy entry span
              const proxyEntrySpan = expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.f.e).to.equal(String(expressProxyControls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(0);
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal('/checkout');
                expect(span.data.http.status).to.equal(200);
              });

              // proxy exit span
              const proxyExitSpan = expectAtLeastOneMatching(spans, span => {
                expect(span.t).to.equal(proxyEntrySpan.t);
                expect(span.p).to.equal(proxyEntrySpan.s);
                expect(span.n).to.equal('node.http.client');
                expect(span.f.e).to.equal(String(expressProxyControls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(0);
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal('http://localhost:3211/proxy-call/checkout');
                expect(span.data.http.status).to.equal(200);
              });

              expectAtLeastOneMatching(spans, span => {
                expect(span.t).to.equal(proxyEntrySpan.t);
                expect(span.p).to.equal(proxyExitSpan.s);
                expect(span.n).to.equal('node.http.server');
                expect(span.f.e).to.equal(String(expressControls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(0);
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal('/proxy-call/checkout');
                expect(span.data.http.status).to.equal(200);
              });
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
            agentStubControls.getSpans().then(spans => {
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
          target: 'http://127.0.0.2:49162/foobar'
        })
        .then(() =>
          retry(() =>
            agentStubControls.getSpans().then(spans => {
              expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.client');
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(1);
                expect(span.f.e).to.equal(String(expressProxyControls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.async).to.not.exist;
                expect(span.data.http.error).to.be.a('string');
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal('http://127.0.0.2:49162/foobar');
              });
            })
          )
        ));

    it('must not explode when asked to request unknown hosts', () =>
      expressProxyControls
        .sendRequest({
          method: 'POST',
          path: '/callInvalidUrl',
          responseStatus: 503,
          target: '://127.0.0.2:49162/foobar'
        })
        .then(() =>
          retry(() =>
            agentStubControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(1);

              expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(1);
              });
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
        agentStubControls.getSpans().then(spans => {
          callsNumbers.forEach(call => {
            const proxyEntrySpan = expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressProxyControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal(`/call-${call}`);
              expect(span.data.http.status).to.equal((call % 20) + 200);
            });

            // proxy exit span
            const proxyExitSpan = expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(proxyEntrySpan.t);
              expect(span.p).to.equal(proxyEntrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.f.e).to.equal(String(expressProxyControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal(`http://localhost:3211/proxy-call/call-${call}`);
              expect(span.data.http.status).to.equal((call % 20) + 200);
            });

            expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(proxyEntrySpan.t);
              expect(span.p).to.equal(proxyExitSpan.s);
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal(`/proxy-call/call-${call}`);
              expect(span.data.http.status).to.equal((call % 20) + 200);
            });
          });
        })
      )
    );
  });
});
