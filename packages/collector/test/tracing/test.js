'use strict';

const expect = require('chai').expect;
const Promise = require('bluebird');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../core/test/config');
const utils = require('../../../core/test/utils');

/**
 * Tests general tracing functionality without having a focus on specific instrumentations.
 */
describe('tracing', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const expressProxyControls = require('../apps/expressProxyControls');
  const agentStubControls = require('../apps/agentStubControls');
  const expressControls = require('../apps/expressControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks();

  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));

  it('must send a span to the agent', () =>
    expressControls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        responseStatus: 201
      })
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            expect(spans.length).to.be.above(0, 'Expecting at least one span');
          })
        )
      ));

  it('must support sub routes', () =>
    expressControls
      .sendRequest({
        method: 'GET',
        path: '/routed/subPath',
        responseStatus: 200
      })
      .then(() =>
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.data.http.url).to.equal('/routed/subPath');
            });
          })
        )
      ));

  describe('serverTiming', () => {
    it('must expose trace id as Server-Timing header', () =>
      expressControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          resolveWithFullResponse: true
        })
        .then(res => {
          expect(res.headers['server-timing']).to.match(/^intid;desc=[a-f0-9]+$/);
        }));

    it('must expose trace id as Server-Timing header: Custom server-timing arrayg', () =>
      expressControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          resolveWithFullResponse: true,
          serverTiming: true
        })
        .then(res => {
          expect(res.headers['server-timing']).to.match(/^myServerTimingKey, intid;desc=[a-f0-9]+$/);
        }));

    it('must expose trace id as Server-Timing header: Custom server-timing array', () =>
      expressControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          resolveWithFullResponse: true,
          serverTimingArray: true
        })
        .then(res => {
          expect(res.headers['server-timing']).to.match(/^key1, key2;dur=42, intid;desc=[a-f0-9]+$/);
        }));
  });

  describe('httpServer', () => {
    it('must send a HTTP span to the agent', () =>
      expressControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          responseStatus: 201
        })
        .then(() =>
          utils.retry(() =>
            agentStubControls.getSpans().then(spans => {
              utils.expectOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(0);
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal('/checkout');
                expect(span.data.http.status).to.equal(201);
                expect(span.data.http.host).to.equal('127.0.0.1:3211');
              });
            })
          )
        ));
    it('must properly capture request params', () =>
      expressControls
        .sendBasicRequest({
          method: 'POST',
          path: '/checkout?stan=isalwayswatching&neversleeps'
        })
        .then(() =>
          utils.retry(() =>
            agentStubControls.getSpans().then(spans => {
              utils.expectOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(0);
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal('/checkout');
                expect(span.data.http.params).to.equal('stan=isalwayswatching&neversleeps');
                expect(span.data.http.status).to.equal(200);
                expect(span.data.http.host).to.equal('127.0.0.1:3211');
              });
            })
          )
        ));

    it('must translate 5XX status codes to error flags', () =>
      expressControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          responseStatus: 503
        })
        .then(() =>
          utils.retry(() =>
            agentStubControls.getSpans().then(spans => {
              utils.expectOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(1);
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal('/checkout');
                expect(span.data.http.status).to.equal(503);
              });
            })
          )
        ));

    it('must not interrupt cookie settings of application', () => {
      const expectedCookie = 'sessionId=42';
      return expressControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          responseStatus: 200,
          cookie: expectedCookie,
          resolveWithFullResponse: true
        })
        .then(response => {
          expect(response.headers['set-cookie']).to.deep.equal([expectedCookie]);
        });
    });

    it('must expose trace ID on incoming HTTP request', () =>
      expressControls
        .sendRequest({
          method: 'GET',
          path: '/return-instana-trace-id',
          responseStatus: 200,
          resolveWithFullResponse: true
        })
        .then(response => {
          const traceId = response.body;
          expect(traceId).to.be.a('string');

          return utils.retry(() =>
            agentStubControls.getSpans().then(spans => {
              expect(spans).to.have.lengthOf(1);

              utils.expectOneMatching(spans, span => {
                expect(span.t).to.equal(traceId);
                expect(span.f.e).to.equal(String(expressControls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.f.h).to.equal('agent-stub-uuid');
              });
            })
          );
        }));
  });

  describe('with proxy', () => {
    expressProxyControls.registerTestHooks();

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
            utils.retry(() =>
              agentStubControls.getSpans().then(spans => {
                expect(spans.length).to.equal(3, 'Expecting at most three spans');

                // proxy entry span
                const proxyEntrySpan = utils.expectOneMatching(spans, span => {
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
                const proxyExitSpan = utils.expectOneMatching(spans, span => {
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
                  expect(span.data.http.url).to.equal('http://127.0.0.1:3211/proxy-call/checkout');
                  expect(span.data.http.status).to.equal(201);
                });

                utils.expectOneMatching(spans, span => {
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
            utils.retry(() =>
              agentStubControls.getSpans().then(spans => {
                expect(spans.length).to.equal(3, 'Expecting at most three spans');

                // proxy entry span
                const proxyEntrySpan = utils.expectOneMatching(spans, span => {
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
                const proxyExitSpan = utils.expectOneMatching(spans, span => {
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
                  expect(span.data.http.url).to.equal('http://127.0.0.1:3211/proxy-call/checkout');
                  expect(span.data.http.status).to.equal(200);
                });

                utils.expectOneMatching(spans, span => {
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
            utils.retry(() =>
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
            utils.retry(() =>
              agentStubControls.getSpans().then(spans => {
                utils.expectOneMatching(spans, span => {
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
            utils.retry(() =>
              agentStubControls.getSpans().then(spans => {
                expect(spans).to.have.lengthOf(1);

                utils.expectOneMatching(spans, span => {
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
        utils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            callsNumbers.forEach(call => {
              const proxyEntrySpan = utils.expectOneMatching(spans, span => {
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
              const proxyExitSpan = utils.expectOneMatching(spans, span => {
                expect(span.t).to.equal(proxyEntrySpan.t);
                expect(span.p).to.equal(proxyEntrySpan.s);
                expect(span.n).to.equal('node.http.client');
                expect(span.f.e).to.equal(String(expressProxyControls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(0);
                expect(span.data.http.method).to.equal('POST');
                expect(span.data.http.url).to.equal(`http://127.0.0.1:3211/proxy-call/call-${call}`);
                expect(span.data.http.status).to.equal((call % 20) + 200);
              });

              utils.expectOneMatching(spans, span => {
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
});
