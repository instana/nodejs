/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');

const portfinder = require('@_local/collector/test/test_util/portfinder');
const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const delay = require('@_local/core/test/test_util/delay');
const { retryUntilSpansMatch, expectExactlyOneMatching } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const agentControls = globalAgent.instance;

const foreignTraceIdLeftHalf = 'f0e1567890123456';
const foreignTraceIdRightHalf = '78901234567bcdea';
const foreignTraceId = `${foreignTraceIdLeftHalf}${foreignTraceIdRightHalf}`;
const foreignParentId = '1020304050607080';
const LEFT_PAD_16 = '0000000000000000';
const upstreamInstanaTraceId = 'ffeeddccbbaa9988';
const upstreamInstanaParentId = '7766554433221100';
let otherVendorAppPort;

module.exports = function () {
  describe('tracing/W3C Trace Context', function () {
    this.timeout(config.getTestTimeout() * 2);
    globalAgent.setUpCleanUpHooks();

    [false, true].forEach(registerSuite);

    function registerSuite(http2) {
      describe(`tracing/W3C Trace Context (${http2 ? 'HTTP2' : 'HTTP1'})`, () => {
        let instanaAppControls;
        let otherVendorAppControls;

        before(async () => {
          otherVendorAppPort = portfinder();

          instanaAppControls = new ProcessControls({
            dirname: __dirname,
            useGlobalAgent: true,
            http2,
            env: {
              APM_VENDOR: 'instana',
              DOWNSTREAM_PORT: otherVendorAppPort,
              APP_USES_HTTP2: http2
            }
          });
          otherVendorAppControls = new ProcessControls({
            dirname: __dirname,
            port: otherVendorAppPort,
            http2,
            // not passing agent controls because this app will not connect to the agent
            env: {
              APM_VENDOR: 'other-spec-compliant',
              DOWNSTREAM_PORT: instanaAppControls.getPort(),
              APP_USES_HTTP2: http2
            },
            collectorUninitialized: true
          });

          await instanaAppControls.startAndWaitForAgentConnection();
          await otherVendorAppControls.start();
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await instanaAppControls.stop();
          await otherVendorAppControls.stop();
        });

        describe('Instana -> Other Vendor', () => {
          // First request to Instana does not have spec headers, so we expect a trace to be started.
          // We expect correct spec headers to be passed downstream by the Instana service. The trace ID in the spec
          // headers should be the one from the trace that Instana starts.
          it('Instana should start a spec trace and pass the correct spec headers downstream', () => {
            startRequest({ app: instanaAppControls, depth: 1 }).then(response => {
              const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntryRoot = verifyHttpRootEntry({ spans, url: '/start', instanaAppControls });
                const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

                const instanaTraceId = instanaHttpEntryRoot.t;
                const instanaExitSpanId = instanaHttpExit.s;

                expect(traceparent).to.match(new RegExp(`00-${LEFT_PAD_16}${instanaTraceId}-${instanaExitSpanId}-03`));
                expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId}`));
              });
            });
          });

          // First request to Instana already has spec headers, simulating a (spec) trace in progress. We expect the
          // Instana tracer to respect the incoming IDs, but limit the trace ID to 64 bit for backwards compatibility with
          // older Instana tracers. We also expect the Instana tracer to continue the W3C trace. Finally, we expect the
          // correct spec headers to be passed downstream by the Instana service.
          // Furthermore, the random trace ID flag should be set since it was set in the incoming header.
          it(
            'Instana continues a spec trace and passes the correct spec headers downstream ' +
              '(upstream sets the random trace ID flag)',
            () =>
              startRequest({
                app: instanaAppControls,
                depth: 1,
                withSpecHeaders: 'valid-sampled-with-random-trace-id'
              }).then(response => {
                const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
                return retryUntilSpansMatch(agentControls, spans => {
                  const instanaHttpEntry = verifyHttpEntry({
                    spans,
                    instanaAppControls,
                    parentSpan: {
                      t: foreignTraceIdRightHalf,
                      s: foreignParentId
                    },
                    url: '/start',
                    usedTraceParent: true,
                    longTraceId: foreignTraceId
                  });
                  const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntry, '/end');

                  const instanaExitSpanId = instanaHttpExit.s;
                  expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-03`));
                  expect(tracestate).to.match(new RegExp(`in=${foreignTraceIdRightHalf};${instanaExitSpanId}`));
                });
              })
          );

          // First request to Instana already has spec headers, simulating a (spec) trace in progress. We expect the
          // Instana tracer to respect the incoming IDs, but limit the trace ID to 64 bit for backwards compatibility with
          // older Instana tracers. We also expect the Instana tracer to continue the W3C trace. Finally, we expect the
          // correct spec headers to be passed downstream by the Instana service.
          // Furthermore, the random trace ID flag should be unset since it was unset in the incoming header.
          it(
            'Instana continues a spec trace and passes the correct spec headers downstream ' +
              '(upstream does _not_ set the random trace ID flag)',
            () =>
              startRequest({
                app: instanaAppControls,
                depth: 1,
                withSpecHeaders: 'valid-sampled-no-random-trace-id'
              }).then(response => {
                const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
                return retryUntilSpansMatch(agentControls, spans => {
                  const instanaHttpEntry = verifyHttpEntry({
                    spans,
                    instanaAppControls,
                    parentSpan: {
                      t: foreignTraceIdRightHalf,
                      s: foreignParentId
                    },
                    url: '/start',
                    usedTraceParent: true,
                    longTraceId: foreignTraceId
                  });
                  const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntry, '/end');

                  const instanaExitSpanId = instanaHttpExit.s;
                  expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-01`));
                  expect(tracestate).to.match(new RegExp(`in=${foreignTraceIdRightHalf};${instanaExitSpanId}`));
                });
              })
          );

          // First request to Instana already has spec headers with sampled=0, simulating a (spec) trace in progress where
          // the most recent upstream service did not record tracing data. We still expect Instana to continue the W3C
          // trace with the W3C trace ID from traceparent (the parent element has not been recorded, but other ancestor
          // elements might have been recorded). We also expect the correct spec headers to be passed downstream by the
          // Instana service. In particular, it should keep the same trace ID it received when passing down spec headers.
          // Furthermore, the random trace ID flag should be set since it was set in the incoming header.
          it('Instana continues a spec trace with sampled=0 (upstream sets the random trace ID flag)', () =>
            startRequest({
              app: instanaAppControls,
              depth: 1,
              withSpecHeaders: 'valid-not-sampled-with-random-trace-id'
            }).then(response => {
              const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntryRoot = verifyHttpEntry({
                  spans,
                  instanaAppControls,
                  parentSpan: {
                    t: foreignTraceIdRightHalf,
                    s: foreignParentId
                  },
                  url: '/start',
                  usedTraceParent: true,
                  longTraceId: foreignTraceId
                });
                const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

                const instanaExitSpanId = instanaHttpExit.s;
                expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-03`));
                expect(tracestate).to.match(new RegExp(`in=${foreignTraceIdRightHalf};${instanaExitSpanId}`));
              });
            }));

          // First request to Instana already has spec headers with sampled=0, simulating a (spec) trace in progress where
          // the most recent upstream service did not record tracing data.  We still expect Instana to continue the W3C
          // trace with the W3C trace ID from traceparent (the parent element has not been recorded, but other ancestor
          // elements might have been recorded). We also expect the correct spec headers to be passed downstream by the
          // Instana service. In particular, it should keep the same trace ID it received when passing down spec headers.
          // Furthermore, the random trace ID flag should be unset since it was unset in the incoming header.
          it('Instana continues a spec trace with sampled=0 (upstream does not set the random trace ID flag)', () =>
            startRequest({
              app: instanaAppControls,
              depth: 1,
              withSpecHeaders: 'valid-not-sampled-no-random-trace-id'
            }).then(response => {
              const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntryRoot = verifyHttpEntry({
                  spans,
                  instanaAppControls,
                  parentSpan: {
                    t: foreignTraceIdRightHalf,
                    s: foreignParentId
                  },
                  url: '/start',
                  usedTraceParent: true,
                  longTraceId: foreignTraceId
                });
                const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

                const instanaExitSpanId = instanaHttpExit.s;
                expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-01`));
                expect(tracestate).to.match(new RegExp(`in=${foreignTraceIdRightHalf};${instanaExitSpanId}`));
              });
            }));

          // First request to Instana has an invalid traceparent header. We expect the spec trace to be restarted and an
          // Instana trace to be started.
          it('Instana restarts the trace when receiving an invalid traceparent', () =>
            startRequest({ app: instanaAppControls, depth: 1, withSpecHeaders: 'invalid-traceparent' }).then(response => {
              const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntryRoot = verifyHttpRootEntry({ spans, url: '/start', instanaAppControls });
                const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

                const instanaTraceId = instanaHttpEntryRoot.t;
                const instanaExitSpanId = instanaHttpExit.s;
                expect(traceparent).to.match(new RegExp(`00-${LEFT_PAD_16}${instanaTraceId}-${instanaExitSpanId}-03`));
                expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId}`));
              });
            }));

          // First request to Instana has a traceparent header with a newer version than we support.
          // We expect the parts of the headers that we understand (in particular, the trace ID/parent ID from traceparent
          // and the tracestate key-value pairs to be reused.
          it('Instana uses the known parts of the traceparent header when the spec version is newer', () =>
            startRequest({ app: instanaAppControls, depth: 1, withSpecHeaders: 'too-new-traceparent' }).then(response => {
              const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);

              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntry = verifyHttpEntry({
                  spans,
                  instanaAppControls,
                  parentSpan: {
                    t: foreignTraceIdRightHalf,
                    s: foreignParentId
                  },
                  url: '/start',
                  usedTraceParent: true,
                  longTraceId: foreignTraceId
                });
                const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntry, '/end');

                const instanaExitSpanId = instanaHttpExit.s;
                expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-03`));
                expect(tracestate).to.match(
                  new RegExp(`in=${foreignTraceIdRightHalf};${instanaExitSpanId},thing=foo,bar=baz`)
                );
              });
            }));

          // First request to Instana has a valid traceparent but an invalid tracestate header. We expect the W3C trace to
          // be continued.
          it('Instana continues the trace when tracestate is invalid', () =>
            startRequest({ app: instanaAppControls, depth: 1, withSpecHeaders: 'invalid-tracestate' }).then(response => {
              const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);

              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntry = verifyHttpEntry({
                  spans,
                  instanaAppControls,
                  parentSpan: {
                    t: foreignTraceIdRightHalf,
                    s: foreignParentId
                  },
                  url: '/start',
                  usedTraceParent: true,
                  longTraceId: foreignTraceId
                });
                const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntry, '/end');

                const instanaExitSpanId = instanaHttpExit.s;
                expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-01`));
                expect(tracestate).to.match(new RegExp(`in=${foreignTraceIdRightHalf};${instanaExitSpanId}`));
              });
            }));

          // First request to Instana has X-INSTANA-L and no spec headers. We expect no trace to be started and
          // X-INSTANA-L and spec headers with sampled=0 to be passed down.
          it('Instana should not start a trace when receiving X-INSTANA-L=0 and no spec headers', () =>
            startRequest({ app: instanaAppControls, depth: 1, withInstanaHeaders: 'suppress' })
              .then(response => {
                response = response && response.body ? JSON.parse(response.body) : response;
                expect(response.instanaHeaders).to.be.an('object');
                expect(response.instanaHeaders.t).to.not.exist;
                expect(response.instanaHeaders.s).to.not.exist;
                // X-INSTANA-L: 0 is passed down
                expect(response.instanaHeaders.l).to.equal('0');
                expect(response.w3cTraceContext).to.be.an('object');
                expect(response.w3cTraceContext.receivedHeaders).to.be.an('object');
                const traceparent = response.w3cTraceContext.receivedHeaders.traceparent;
                expect(traceparent).to.exist;
                expect(response.w3cTraceContext.receivedHeaders.tracestate).to.not.exist;
                // sampled=0 is passed down
                expect(traceparent).to.match(new RegExp(`00-${LEFT_PAD_16}[0-9a-f]{16}-[0-9a-f]{16}-02`));
              })
              // give spans a chance to come in
              .then(() => delay(500))
              .then(() =>
                // verify there are no spans
                agentControls.getSpans().then(spans => {
                  expect(spans).to.have.lengthOf(0);
                })
              ));

          describe('with incoming X-INSTANA-T/-S', () => {
            it('Instana continues the Instana trace and starts a spec trace', () =>
              startRequest({ app: instanaAppControls, depth: 1, withInstanaHeaders: 'trace-in-progress' }).then(
                response => {
                  const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
                  return retryUntilSpansMatch(agentControls, spans => {
                    const instanaHttpEntry = verifyHttpEntry({
                      instanaAppControls,
                      spans,
                      // Pass a dummy parent span to verifyHttpEntry, this verifies that the incoming X-INSTANA- headers
                      // have been used.
                      parentSpan: {
                        t: upstreamInstanaTraceId,
                        s: upstreamInstanaParentId
                      },
                      url: '/start'
                    });
                    const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntry, '/end');

                    const instanaExitSpanId = instanaHttpExit.s;
                    expect(traceparent).to.match(
                      new RegExp(`00-${LEFT_PAD_16}${upstreamInstanaTraceId}-${instanaExitSpanId}-03`)
                    );
                    expect(tracestate).to.match(new RegExp(`in=${upstreamInstanaTraceId};${instanaExitSpanId}`));
                  });
                }
              ));

            it('Instana continues the Instana trace and spec trace', () =>
              startRequest({
                app: instanaAppControls,
                depth: 1,
                withSpecHeaders: 'valid-sampled-with-random-trace-id',
                withInstanaHeaders: 'trace-in-progress'
              }).then(response => {
                const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
                return retryUntilSpansMatch(agentControls, spans => {
                  const instanaHttpEntry = verifyHttpEntry({
                    instanaAppControls,
                    spans,
                    // Pass a dummy parent span to verifyHttpEntry, this verifies that the incoming X-INSTANA- headers
                    // have been used.
                    parentSpan: {
                      t: upstreamInstanaTraceId,
                      s: upstreamInstanaParentId
                    },
                    url: '/start'
                  });
                  const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntry, '/end');

                  const instanaExitSpanId = instanaHttpExit.s;
                  expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-03`));
                  expect(tracestate).to.match(new RegExp(`in=${upstreamInstanaTraceId};${instanaExitSpanId}`));
                });
              }));

            it('Instana continues the Instana trace and spec trace when traceparent has sampled=0', () =>
              startRequest({
                app: instanaAppControls,
                depth: 1,
                withSpecHeaders: 'valid-not-sampled-no-random-trace-id',
                withInstanaHeaders: 'trace-in-progress'
              }).then(response => {
                const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
                return retryUntilSpansMatch(agentControls, spans => {
                  const instanaHttpEntry = verifyHttpEntry({
                    instanaAppControls,
                    spans,
                    // Pass a dummy parent span to verifyHttpEntry, this verifies that the incoming X-INSTANA- headers
                    // have been used.
                    parentSpan: {
                      t: upstreamInstanaTraceId,
                      s: upstreamInstanaParentId
                    },
                    url: '/start'
                  });
                  const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntry, '/end');

                  // The Instana-instrumented process receives sampled=0 but not X-INSTANA-L: 0, so we expect sampled=1 to
                  // be passed down.
                  const instanaExitSpanId = instanaHttpExit.s;
                  expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-01`));
                  expect(tracestate).to.match(new RegExp(`in=${upstreamInstanaTraceId};${instanaExitSpanId}`));
                });
              }));
          });

          describe('with incoming X-INSTANA-L: 0', () => {
            // First request to Instana has spec headers with sampled=0 and X-INSTANA-L. We expect no trace to be started
            // and X-INSTANA-L and spec headers with sampled=0 to be passed down.
            it('Instana should not start a trace when receiving spec headers (unsampled) and X-INSTANA-L=0', () =>
              startRequest({
                app: instanaAppControls,
                depth: 1,
                withSpecHeaders: 'valid-not-sampled-no-random-trace-id',
                withInstanaHeaders: 'suppress'
              })
                .then(response => {
                  response = response && response.body ? JSON.parse(response.body) : response;
                  expect(response.instanaHeaders).to.be.an('object');
                  expect(response.instanaHeaders.t).to.not.exist;
                  expect(response.instanaHeaders.s).to.not.exist;
                  // X-INSTANA-L: 0 is passed down
                  expect(response.instanaHeaders.l).to.equal('0');
                  expect(response.w3cTraceContext).to.be.an('object');
                  expect(response.w3cTraceContext.receivedHeaders).to.be.an('object');
                  const traceparent = response.w3cTraceContext.receivedHeaders.traceparent;
                  const tracestate = response.w3cTraceContext.receivedHeaders.tracestate;
                  // given IDs and sampled=0 is passed down
                  expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${foreignParentId}-00`));
                  expect(tracestate).to.equal('thing=foo,bar=baz');
                })
                // give spans a chance to come in
                .then(() => delay(500))
                .then(() =>
                  // verify there are no spans
                  agentControls.getSpans().then(spans => {
                    expect(spans).to.have.lengthOf(0);
                  })
                ));

            // First request to Instana has spec headers with sampled=1 and X-INSTANA-L=0. We expect no trace to be
            // started and X-INSTANA-L=0 and spec headers with a new parent ID and sampled=0 to be passed down.
            it('Instana should not start a trace when receiving spec headers (sampled) and X-INSTANA-L=0', () =>
              startRequest({
                app: instanaAppControls,
                depth: 1,
                withSpecHeaders: 'valid-sampled-no-random-trace-id',
                withInstanaHeaders: 'suppress'
              })
                .then(response => {
                  response = response && response.body ? JSON.parse(response.body) : response;
                  expect(response.instanaHeaders).to.be.an('object');
                  expect(response.instanaHeaders.t).to.not.exist;
                  expect(response.instanaHeaders.s).to.not.exist;
                  // X-INSTANA-L: 0 is passed down
                  expect(response.instanaHeaders.l).to.equal('0');
                  expect(response.w3cTraceContext).to.be.an('object');
                  expect(response.w3cTraceContext.receivedHeaders).to.be.an('object');
                  const traceparent = response.w3cTraceContext.receivedHeaders.traceparent;
                  const tracestate = response.w3cTraceContext.receivedHeaders.tracestate;
                  // The spec says we must create a new parent ID when updating the sampled flag.
                  const traceParentMatch = new RegExp(`00-${foreignTraceId}-([0-9a-f]{16})-00`).exec(traceparent);
                  expect(traceParentMatch).to.exist;
                  expect(traceParentMatch[1]).to.not.equal(foreignParentId);
                  expect(tracestate).to.equal('thing=foo,bar=baz');
                })
                // give spans a chance to come in
                .then(() => delay(500))
                .then(() =>
                  // verify there are no spans
                  agentControls.getSpans().then(spans => {
                    expect(spans).to.have.lengthOf(0);
                  })
                ));

            // First request to Instana has no spec headers  and X-INSTANA-L. We expect no trace to be started
            // and X-INSTANA-L and spec headers with a new parent ID and sampled=0 to be passed down.
            it(
              'Instana should not start an Instana trace but pass down traceparent when receiving X-INSTANA-L=0 and no ' +
                'spec headers',
              () =>
                startRequest({ app: instanaAppControls, depth: 1, withInstanaHeaders: 'suppress' })
                  .then(response => {
                    response = response && response.body ? JSON.parse(response.body) : response;
                    expect(response.instanaHeaders).to.be.an('object');
                    expect(response.instanaHeaders.t).to.not.exist;
                    expect(response.instanaHeaders.s).to.not.exist;
                    // X-INSTANA-L: 0 is passed down
                    expect(response.instanaHeaders.l).to.equal('0');
                    expect(response.w3cTraceContext).to.be.an('object');
                    expect(response.w3cTraceContext.receivedHeaders).to.be.an('object');
                    const traceparent = response.w3cTraceContext.receivedHeaders.traceparent;
                    const tracestate = response.w3cTraceContext.receivedHeaders.tracestate;
                    const traceParentMatch = new RegExp(`00-${LEFT_PAD_16}([0-9a-f]{16})-([0-9a-f]{16})-02`).exec(
                      traceparent
                    );
                    expect(traceParentMatch).to.exist;
                    expect(traceParentMatch[1]).to.not.equal(foreignTraceId);
                    expect(traceParentMatch[1]).to.not.equal(upstreamInstanaTraceId);
                    expect(traceParentMatch[1]).to.not.equal(foreignParentId);
                    expect(traceParentMatch[1]).to.not.equal(upstreamInstanaParentId);
                    expect(tracestate).to.not.exist;
                  })
                  // give spans a chance to come in
                  .then(() => delay(500))
                  .then(() =>
                    // verify there are no spans
                    agentControls.getSpans().then(spans => {
                      expect(spans).to.have.lengthOf(0);
                    })
                  )
            );
          });
        });

        describe('Instana -> Other Vendor -> Instana', () => {
          // The other vendor participates in the trace. We expect one continuous Instana trace, and the second Instana
          // HTTP entry span to have Instana ancestor data (span.ia).
          it('Instana should continue a trace after a detour via a participating service', () =>
            startRequest({ app: instanaAppControls, depth: 2 }).then(response => {
              const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntryRoot = verifyHttpRootEntry({ spans, url: '/start', instanaAppControls });
                const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/continue');

                const instanaTraceId = instanaHttpEntryRoot.t;
                const instanaExitSpanId = instanaHttpExit.s;
                expect(traceparent).to.match(new RegExp(`00-${LEFT_PAD_16}${instanaTraceId}-[0-9a-f]{16}-01`));
                expect(tracestate).to.match(new RegExp(`other=newParentId,in=${instanaTraceId};${instanaExitSpanId}`));

                const { traceIdFromTraceParent, parentIdFromTraceParent } = extractIdsFromTraceParent(traceparent);

                // The trace ID from the traceparent header should match then Instana trace ID (modulo left padding).
                expect(traceIdFromTraceParent).to.equal(`${LEFT_PAD_16}${instanaTraceId}`);
                verifyTraceContextAgainstTerminalSpan({
                  instanaAppControls,
                  response,
                  spans,
                  parentSpan: {
                    t: instanaTraceId,
                    s: parentIdFromTraceParent
                  },
                  instanaTraceId,
                  instanaAncestor: {
                    t: instanaHttpExit.t,
                    p: instanaHttpExit.s
                  },
                  usedTraceParent: true,
                  longTraceId: `${LEFT_PAD_16}${instanaTraceId}`
                });
              });
            }));

          // Instana -> Other Vendor -> Instana.
          // The other vendor only forwards the trace, but does not participate. We expect one continuous Instana trace,
          // and the second Instana HTTP entry span to have an Instana ancestore (span.ia) annotation.
          it('Instana should continue a trace after a detour via a forwarding service', () =>
            startRequest({ app: instanaAppControls, depth: 2, otherMode: 'forward' }).then(response => {
              const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntryRoot = verifyHttpRootEntry({ spans, url: '/start', instanaAppControls });
                const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/continue');

                const instanaTraceId = instanaHttpEntryRoot.t;
                const instanaExitSpanId = instanaHttpExit.s;
                expect(traceparent).to.match(new RegExp(`00-${LEFT_PAD_16}${instanaTraceId}-${instanaExitSpanId}-03`));
                expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId}`));
                // The trace ID from the traceparent header should match then Instana trace ID (modulo left padding).
                const { traceIdFromTraceParent, parentIdFromTraceParent } = extractIdsFromTraceParent(traceparent);
                expect(traceIdFromTraceParent).to.equal(`${LEFT_PAD_16}${instanaTraceId}`);

                verifyTraceContextAgainstTerminalSpan({
                  instanaAppControls,
                  response,
                  spans,
                  parentSpan: {
                    t: instanaTraceId,
                    s: parentIdFromTraceParent
                  },
                  instanaTraceId,
                  instanaAncestor: {
                    t: instanaHttpExit.t,
                    p: instanaHttpExit.s
                  },
                  usedTraceParent: true,
                  longTraceId: `${LEFT_PAD_16}${instanaTraceId}`
                });
              });
            }));

          // Instana -> Other -> Instana.
          // The other vendor soft-restarts trace, that is, it generates a new trace id and parent id for traceparent, but
          // keeps the old tracestate members around (which is an option the spec allows for "front gates into secure
          // networks"). Since/ we will continue the trace based on the traceparent header, the trace will break. The
          // span.ia object will have a reference to the last Instana span from the original trace. In this edge case,
          // span.io will not enable the back end to fix the trace because we are dealing with two different trace IDs.
          it('The trace will break after a detour when the foreign service has soft-restarted the trace', () =>
            startRequest({ app: instanaAppControls, depth: 2, otherMode: 'soft-restart' }).then(response => {
              const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
              const { traceIdFromTraceParent, parentIdFromTraceParent } = extractIdsFromTraceParent(traceparent);
              response = response && response.body ? JSON.parse(response.body) : response;
              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntryRoot = verifyHttpRootEntry({ spans, url: '/start', instanaAppControls });
                const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/continue');

                const instanaTraceId = instanaHttpEntryRoot.t;
                const instanaExitSpanId = instanaHttpExit.s;

                expect(tracestate).to.match(new RegExp(`^other=newParentId,in=${instanaTraceId};${instanaExitSpanId}$`));

                // Due to the soft-restart, the traceparent's trace ID part shouldn't match the initial trace ID.
                expect(traceIdFromTraceParent).to.not.contain(instanaTraceId);

                expect(response.w3cTraceContext.active).to.be.an('object');
                const instanaTraceIdInActiveTraceContext = response.w3cTraceContext.active.instanaTraceId;
                const instanaParentIdInActiveTraceContext = response.w3cTraceContext.active.instanaParentId;
                expect(instanaTraceIdInActiveTraceContext).to.exist;
                expect(instanaParentIdInActiveTraceContext).to.exist;

                const terminalHttpEntry = verifyHttpEntry({
                  instanaAppControls,
                  spans,
                  parentSpan: {
                    t: traceIdFromTraceParent.substring(16),
                    s: parentIdFromTraceParent
                  },
                  url: '/end',
                  instanaAncestor: {
                    t: instanaTraceId,
                    p: instanaExitSpanId
                  },
                  usedTraceParent: true,
                  longTraceId: traceIdFromTraceParent
                });

                expect(instanaTraceIdInActiveTraceContext).to.not.equal(instanaTraceId);
                // The span ID we put into the in key-value pair in the active trace context must equal the span ID on the
                // span.
                const instanaEntrySpanId = terminalHttpEntry.s;
                expect(instanaParentIdInActiveTraceContext).to.equal(instanaEntrySpanId);

                expect(traceIdFromTraceParent).not.contains(instanaTraceId);
              });
            }));

          // Instana -> Other -> Instana.
          // The other vendor hard-restarts the trace, that is, it generates a new trace id and parent id for traceparent,
          // and also discards the received tracestate header. We do not expect one continuous Instana trace, but
          // rather two separate traces.
          it('The trace will break after a detour when the foreign service has hard-restarted the trace', () =>
            startRequest({ app: instanaAppControls, depth: 2, otherMode: 'hard-restart' }).then(response => {
              const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
              const { traceIdFromTraceParent, parentIdFromTraceParent } = extractIdsFromTraceParent(traceparent);
              response = response && response.body ? JSON.parse(response.body) : response;
              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntryRoot = verifyHttpRootEntry({ spans, url: '/start', instanaAppControls });
                verifyHttpExit(spans, instanaHttpEntryRoot, '/continue');

                const instanaTraceId = instanaHttpEntryRoot.t;
                expect(tracestate).to.equal('other=newParentId');

                // The W3C trace context that was active during processing the last HTTP entry. This is different from
                // response.w3cTraceContext.receivedHeaders because we update the trace context (in particular, the parent
                // ID) after generating the span ID for this HTTP entry.
                expect(response.w3cTraceContext.active).to.be.an('object');
                const instanaTraceIdInActiveTraceContext = response.w3cTraceContext.active.instanaTraceId;
                const instanaParentIdInActiveTraceContext = response.w3cTraceContext.active.instanaParentId;
                expect(instanaTraceIdInActiveTraceContext).to.exist;
                expect(instanaParentIdInActiveTraceContext).to.exist;

                // Find the span for last HTTP entry in to the Instana-instrumented process.
                // In this case, the terminal HTTP entry span is not part of the same trace.
                const terminalHttpEntry = verifyHttpEntry({
                  instanaAppControls,
                  spans,
                  parentSpan: {
                    t: traceIdFromTraceParent.substring(16),
                    s: parentIdFromTraceParent
                  },
                  url: '/end',
                  usedTraceParent: true,
                  longTraceId: traceIdFromTraceParent
                });

                expect(instanaTraceIdInActiveTraceContext).to.not.equal(instanaTraceId);
                // The span ID we put into the in key-value pair in the active trace context must equal the span ID on the
                // span.
                const instanaEntrySpanId = terminalHttpEntry.s;
                expect(instanaParentIdInActiveTraceContext).to.equal(instanaEntrySpanId);

                expect(traceIdFromTraceParent).not.contains(instanaTraceId);
              });
            }));

          it('the trace will break after a detour when the foreign service does not implement W3C trace context', () =>
            startRequest({ app: instanaAppControls, depth: 2, otherMode: 'non-compliant' }).then(response => {
              response = response && response.body ? JSON.parse(response.body) : response;
              expect(response.w3cTraceContext).to.be.an('object');
              expect(response.w3cTraceContext.receivedHeaders).to.deep.equal({});
              response = response && response.body ? JSON.parse(response.body) : response;
              return retryUntilSpansMatch(agentControls, spans => {
                const instanaHttpEntryRoot = verifyHttpRootEntry({ spans, url: '/start', instanaAppControls });
                verifyHttpExit(spans, instanaHttpEntryRoot, '/continue');

                const instanaTraceId = instanaHttpEntryRoot.t;

                // The W3C trace context that was active during processing the last HTTP entry. This is different from
                // response.w3cTraceContext.receivedHeaders because we update the trace context (in particular, the parent
                // ID) after generating the span ID for this HTTP entry.
                expect(response.w3cTraceContext.active).to.be.an('object');
                const instanaTraceIdInActiveTraceContext = response.w3cTraceContext.active.instanaTraceId;
                const instanaParentIdInActiveTraceContext = response.w3cTraceContext.active.instanaParentId;
                expect(instanaTraceIdInActiveTraceContext).to.exist;
                expect(instanaParentIdInActiveTraceContext).to.exist;

                // Find the span for last HTTP entry in to the Instana-instrumented process.
                // In this case, the terminal HTTP entry span is not part of the same trace.
                const terminalHttpEntry = verifyHttpRootEntry({ spans, url: '/end', instanaAppControls });

                expect(instanaTraceIdInActiveTraceContext).to.not.equal(instanaTraceId);
                // The span ID we put into the in key-value pair in the active trace context must equal the span ID on the
                // span.
                const instanaEntrySpanId = terminalHttpEntry.s;
                expect(instanaParentIdInActiveTraceContext).to.equal(instanaEntrySpanId);
              });
            }));
        });

        describe('Other Vendor -> Instana', () => {
          it('Instana should start a spec trace and pass the correct spec headers downstream', () =>
            startRequest({ app: otherVendorAppControls, depth: 1 }).then(response =>
              retryUntilSpansMatch(agentControls, spans => {
                const { traceparent } = getSpecHeadersFromFinalHttpRequest(response);
                const { traceIdFromTraceParent, parentIdFromTraceParent } = extractIdsFromTraceParent(traceparent);
                const instanaHttpEntry = verifyHttpEntry({
                  instanaAppControls,
                  spans,
                  parentSpan: {
                    t: traceIdFromTraceParent.substring(16),
                    s: parentIdFromTraceParent
                  },
                  url: '/end',
                  usedTraceParent: true,
                  longTraceId: traceIdFromTraceParent
                });
                expect(instanaHttpEntry.fp).to.not.exist;
                expect(instanaHttpEntry.ia).to.not.exist;
              })
            ));
        });

        describe('Other Vendor -> Instana -> Other Vendor', () => {
          it('Instana should pass down the correct spec headers', () =>
            startRequest({ app: otherVendorAppControls, depth: 2 }).then(response =>
              retryUntilSpansMatch(agentControls, spans => {
                const { traceparent, tracestate } = getSpecHeadersFromFinalHttpRequest(response);
                const { traceIdFromTraceParent } = extractIdsFromTraceParent(traceparent);

                const instanaHttpEntry = verifyHttpEntry({
                  instanaAppControls,
                  spans,
                  parentSpan: {
                    t: traceIdFromTraceParent.substring(16),
                    s: '?'
                  },
                  url: '/continue',
                  usedTraceParent: true,
                  longTraceId: traceIdFromTraceParent
                });
                expect(instanaHttpEntry.fp).to.not.exist;
                expect(instanaHttpEntry.is).to.not.exist;

                expect(traceparent).to.match(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

                const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntry, '/end');
                const instanaTraceId = instanaHttpEntry.t;
                const instanaExitSpanId = instanaHttpExit.s;

                expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId},other=newParentId`));
              })
            ));
        });
      });
    }
  });
};

function startRequest({ app, depth = 2, withSpecHeaders = null, otherMode = 'participate', withInstanaHeaders }) {
  const request = {
    path: `/start?depth=${depth}&otherMode=${otherMode}`
  };
  if (withSpecHeaders === 'valid-sampled-with-random-trace-id') {
    request.headers = {
      traceparent: `00-${foreignTraceId}-${foreignParentId}-03`,
      tracestate: 'thing=foo,bar=baz'
    };
  } else if (withSpecHeaders === 'valid-sampled-no-random-trace-id') {
    request.headers = {
      traceparent: `00-${foreignTraceId}-${foreignParentId}-01`,
      tracestate: 'thing=foo,bar=baz'
    };
  } else if (withSpecHeaders === 'valid-not-sampled-with-random-trace-id') {
    request.headers = {
      traceparent: `00-${foreignTraceId}-${foreignParentId}-02`,
      tracestate: 'thing=foo,bar=baz'
    };
  } else if (withSpecHeaders === 'valid-not-sampled-no-random-trace-id') {
    request.headers = {
      traceparent: `00-${foreignTraceId}-${foreignParentId}-00`,
      tracestate: 'thing=foo,bar=baz'
    };
  } else if (withSpecHeaders === 'too-new-traceparent') {
    request.headers = {
      traceparent: `01-${foreignTraceId}-${foreignParentId}-03-wait-there-is-more`,
      tracestate: 'thing=foo,bar=baz'
    };
  } else if (withSpecHeaders === 'invalid-traceparent') {
    request.headers = {
      traceparent: `00-${foreignTraceId}-${foreignParentId}-001`,
      tracestate: 'thing=foo,bar=baz'
    };
  } else if (withSpecHeaders === 'invalid-tracestate') {
    request.headers = {
      traceparent: `00-${foreignTraceId}-${foreignParentId}-01`,
      tracestate: 'this will be discarded'
    };
  } else if (withSpecHeaders != null) {
    throw new Error(`Invalid withSpecHeaders value: ${withSpecHeaders}.`);
  }

  if (withInstanaHeaders === 'trace-in-progress') {
    request.headers = request.headers || {};
    request.headers['X-INSTANA-T'] = upstreamInstanaTraceId;
    request.headers['X-INSTANA-S'] = upstreamInstanaParentId;
  } else if (withInstanaHeaders === 'suppress') {
    request.headers = request.headers || {};
    request.headers['X-INSTANA-L'] = '0';
  } else if (withInstanaHeaders != null) {
    throw new Error(`Invalid withInstanaHeaders value: ${withInstanaHeaders}.`);
  }

  request.resolveWithFullResponse = true;
  return app.sendRequest(request);
}

/**
 * This verification checks for some basic properties on the response, which is returned from the last HTTP response in
 * the chain.
 */
function getSpecHeadersFromFinalHttpRequest(response) {
  response = response && response.body ? JSON.parse(response.body) : response;
  expect(response.w3cTraceContext).to.be.an('object');
  expect(response.w3cTraceContext.receivedHeaders).to.be.an('object');
  const traceparent = response.w3cTraceContext.receivedHeaders.traceparent;
  const tracestate = response.w3cTraceContext.receivedHeaders.tracestate;
  expect(traceparent).to.exist;
  expect(tracestate).to.exist;
  return { traceparent, tracestate };
}

/**
 * This verification will only happen for test scenarios where we have a call to the Instana-instrumented service at the
 * end. It basically verifies the incoming trace context headers and the internal trace context state that is used
 * during processing this last request, comparing it against the meta data in the span representing this last call.
 */
function verifyTraceContextAgainstTerminalSpan({
  response,
  spans,
  parentSpan,
  instanaTraceId,
  instanaAncestor,
  usedTraceParent,
  longTraceId,
  instanaAppControls
}) {
  // The W3C trace context that was active during processing the last HTTP entry. This is different from
  // response.w3cTraceContext.receivedHeaders because we update the trace context (in particular, the parent ID) after
  // generating the span ID for this HTTP entry.
  response = response && response.body ? JSON.parse(response.body) : response;
  expect(response.w3cTraceContext.active).to.be.an('object');
  const instanaTraceIdInActiveTraceContext = response.w3cTraceContext.active.instanaTraceId;
  const instanaParentIdInActiveTraceContext = response.w3cTraceContext.active.instanaParentId;
  expect(instanaTraceIdInActiveTraceContext).to.exist;
  expect(instanaParentIdInActiveTraceContext).to.exist;

  // Find the span for last HTTP entry in to the Instana-instrumented process.
  const terminalHttpEntry = verifyHttpEntry({
    instanaAppControls,
    spans,
    parentSpan,
    url: '/end',
    instanaAncestor,
    usedTraceParent,
    longTraceId
  });

  // The trace ID put into the in key-value pair in the active trace context must equal the trace ID on the span.
  expect(instanaTraceIdInActiveTraceContext).to.equal(instanaTraceId);
  // The span ID we put into the in key-value pair in the active trace context must equal the span ID on the span.
  const instanaEntrySpanId = terminalHttpEntry.s;
  expect(instanaParentIdInActiveTraceContext).to.equal(instanaEntrySpanId);
}

function extractIdsFromTraceParent(traceparent) {
  const traceParentMatch = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/.exec(traceparent);
  const traceIdFromTraceParent = traceParentMatch[1];
  const parentIdFromTraceParent = traceParentMatch[2];
  return { traceIdFromTraceParent, parentIdFromTraceParent };
}

function verifyHttpRootEntry({ spans, url, instanaAppControls }) {
  return verifyHttpEntry({ spans, parentSpan: null, url, instanaAppControls });
}

function verifyHttpEntry({
  spans,
  parentSpan,
  url,
  instanaAncestor,
  usedTraceParent,
  longTraceId,
  instanaAppControls
}) {
  let expectations = [
    span => expect(span.n).to.equal('node.http.server'),
    span => expect(span.k).to.equal(constants.ENTRY),
    span => expect(span.async).to.not.exist,
    span => expect(span.error).to.not.exist,
    span => expect(span.ec).to.equal(0),
    span => expect(span.t).to.be.a('string'),
    span => expect(span.s).to.be.a('string'),
    span => expect(span.data.http.method).to.equal('GET'),
    span => expect(span.data.http.url).to.equal(url),
    span => expect(span.data.http.host).to.equal(`localhost:${instanaAppControls.getPort()}`),
    span => expect(span.data.http.status).to.equal(200)
  ];

  if (parentSpan) {
    expectations.push(span => expect(span.t).to.equal(parentSpan.t));
    if (parentSpan.s !== '?') {
      expectations.push(span => expect(span.p).to.equal(parentSpan.s));
    }
  } else {
    expectations.push(span => expect(span.p).to.not.exist);
  }

  if (instanaAncestor) {
    expectations = expectations.concat([
      span => expect(span.ia).to.be.an('object'),
      span => expect(span.ia.t).to.equal(instanaAncestor.t),
      span => expect(span.ia.p).to.equal(instanaAncestor.p)
    ]);
  } else {
    expectations.push(span => expect(span.ia).to.be.undefined);
  }

  if (usedTraceParent) {
    expectations.push(span => expect(span.tp).to.be.true);
  } else {
    expectations.push(span => expect(span.tp).to.not.exist);
  }

  if (longTraceId) {
    expectations.push(span => expect(span.lt).to.equal(longTraceId));
  } else {
    expectations.push(span => expect(span.lt).to.not.exist);
  }

  // span.fp is no longer supported
  expectations.push(span => expect(span.fp).to.not.exist);

  return expectExactlyOneMatching(spans, expectations);
}

function verifyHttpExit(spans, parentSpan, url) {
  return expectExactlyOneMatching(spans, [
    span => expect(span.n).to.equal('node.http.client'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.async).to.not.exist,
    span => expect(span.error).to.not.exist,
    span => expect(span.ec).to.equal(0),
    span => expect(span.t).to.be.a('string'),
    span => expect(span.s).to.be.a('string'),
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.data.http.method).to.equal('GET'),
    span => expect(span.data.http.url).to.match(RegExp(`^.*:${otherVendorAppPort}${url}$`)),
    span => expect(span.data.http.status).to.equal(200),
    span => expect(span.fp).to.not.exist
  ]);
}
