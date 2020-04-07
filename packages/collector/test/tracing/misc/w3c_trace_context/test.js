'use strict';

const path = require('path');
const { expect } = require('chai');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const delay = require('../../../../../core/test/test_util/delay');
const { retryUntilSpansMatch, expectAtLeastOneMatching } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../ProcessControls');

let agentControls;

const instanaAppPort = 4200;
const otherVendorAppPort = 4201;

const foreignTraceId = 'f0e156789012345678901234567bcdea';
const foreignParentId = '1020304050607080';
const LEFT_PAD_16 = '0000000000000000';
const upstreamInstanaTraceId = 'ffeeddccbbaa9988';
const upstreamInstanaParentId = '7766554433221100';

describe('tracing/W3C Trace Context (with processes instrumented by a different vendor)', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout() * 2);

  const allControls = startApps();
  const { instanaAppControls, otherVendorAppControls } = allControls;

  describe('Instana -> Other Vendor', () => {
    // First request to Instana does not have spec headers, so we expect a trace to be started.
    // We expect correct spec headers to be passed downstream by the Instana service. The trace ID in the spec headers
    // should be the one from the trace that Instana starts.
    it('Instana should start a spec trace and pass the correct spec headers downstream', () =>
      startRequest({ app: instanaAppControls, depth: 1 }).then(response => {
        const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
        return retryUntilSpansMatch(agentControls, spans => {
          const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', 'none');
          const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

          const instanaTraceId = instanaHttpEntryRoot.t;
          const instanaExitSpanId = instanaHttpExit.s;

          expect(traceparent).to.match(new RegExp(`00-${LEFT_PAD_16}${instanaTraceId}-${instanaExitSpanId}-01`));
          expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId}`));
        });
      }));

    // First request to Instana already has spec headers, simulating a (spec) trace in progress. We expect an Instana
    // trace to be started. We also expect the correct spec headers to be passed downstream by the Instana/ service.
    // In particular, it should keep the same foreign trace ID it received when passing down spec headers, even though
    // the Instana trace uses a different one.
    it('Instana continues a spec trace and passes the correct spec headers downstream', () => {
      return startRequest({ app: instanaAppControls, depth: 1, withSpecHeaders: 'valid' }).then(response => {
        const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
        return retryUntilSpansMatch(agentControls, spans => {
          const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', {
            t: foreignTraceId,
            p: foreignParentId,
            lts: 'thing=foo'
          });
          const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

          const instanaTraceId = instanaHttpEntryRoot.t;
          const instanaExitSpanId = instanaHttpExit.s;
          expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-01`));
          expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId}`));
          expect(instanaTraceId).to.not.equal(foreignTraceId);
        });
      });
    });

    // First request to Instana already has spec headers with sampled=0, simulating a (spec) trace in progress where
    // the most recent upstream service did not record tracing data. We still expect an Instana trace to be started.
    // We also expect the correct spec headers to be passed downstream by the Instana service. In particular, it
    // should keep the same foreign trace ID it received when passing down spec headers, even though the Instana trace
    // uses a different one.
    it('Instana continues a spec trace with sampled=0', () => {
      return startRequest({ app: instanaAppControls, depth: 1, withSpecHeaders: 'not-sampled' }).then(response => {
        const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
        return retryUntilSpansMatch(agentControls, spans => {
          const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', {
            t: foreignTraceId,
            p: foreignParentId,
            lts: 'thing=foo'
          });
          const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

          const instanaTraceId = instanaHttpEntryRoot.t;
          const instanaExitSpanId = instanaHttpExit.s;
          expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-01`));
          expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId}`));
          expect(instanaTraceId).to.not.equal(foreignTraceId);
        });
      });
    });

    // First request to Instana has an invalid traceparent header. We expect the spec trace to be restarted and an
    // Instana trace to be started.
    it('Instana restarts the trace when receiving an invalid traceparent', () => {
      return startRequest({ app: instanaAppControls, depth: 1, withSpecHeaders: 'invalid-traceparent' }).then(
        response => {
          const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
          return retryUntilSpansMatch(agentControls, spans => {
            const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', 'none');
            const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

            const instanaTraceId = instanaHttpEntryRoot.t;
            const instanaExitSpanId = instanaHttpExit.s;
            expect(traceparent).to.match(new RegExp(`00-${LEFT_PAD_16}${instanaTraceId}-${instanaExitSpanId}-01`));
            expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId}`));
          });
        }
      );
    });

    // First request to Instana has an traceparent header with a newer version than we support.
    // We expect the parts of the headers that we understand (in particular, the foreign trace ID from traceparent
    // and the tracestate key-value pairs to be reused.
    it('Instana uses the known parts of the traceparent header when the spec version is newer', () => {
      return startRequest({ app: instanaAppControls, depth: 1, withSpecHeaders: 'too-new-traceparent' }).then(
        response => {
          const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);

          return retryUntilSpansMatch(agentControls, spans => {
            const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', {
              t: foreignTraceId,
              p: foreignParentId,
              lts: 'thing=foo'
            });
            const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

            const instanaTraceId = instanaHttpEntryRoot.t;
            const instanaExitSpanId = instanaHttpExit.s;
            expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-01`));
            expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId},thing=foo,bar=baz`));
          });
        }
      );
    });

    // First request to Instana has a valid traceparent but an invalid tracestate header. We expect the an Instanj
    // trace to be started but the trace ID from traceparent needs to be propagated.
    it('Instana propagates the trace ID from traceparent when tracestate is invalid', () => {
      return startRequest({ app: instanaAppControls, depth: 1, withSpecHeaders: 'invalid-tracestate' }).then(
        response => {
          const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);

          return retryUntilSpansMatch(agentControls, spans => {
            const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', {
              t: foreignTraceId,
              p: foreignParentId
            });
            const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

            const instanaTraceId = instanaHttpEntryRoot.t;
            const instanaExitSpanId = instanaHttpExit.s;
            expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-01`));
            expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId}`));
            expect(instanaTraceId).to.not.equal(foreignTraceId);
          });
        }
      );
    });

    // First request to Instana has X-INSTANA-L and no spec headers. We expect no trace to be started and
    // X-INSTANA-L and spec headers with sampled=0 to be passed down.
    it('Instana should not start a trace when receiving X-INSTANA-L=0 and no spec headers', () =>
      startRequest({ app: instanaAppControls, depth: 1, withInstanaHeaders: 'suppress' })
        .then(response => {
          expect(response.instanaHeaders).to.be.an('object');
          expect(response.instanaHeaders.t).to.not.exist;
          expect(response.instanaHeaders.s).to.not.exist;
          // X-INSTANA-L: 0 is passed down
          expect(response.instanaHeaders.l).to.equal('0');
          expect(response.w3cTaceContext).to.be.an('object');
          expect(response.w3cTaceContext.receivedHeaders).to.be.an('object');
          const traceparent = response.w3cTaceContext.receivedHeaders.traceparent;
          expect(traceparent).to.exist;
          expect(response.w3cTaceContext.receivedHeaders.tracestate).to.not.exist;
          // sampled=0 is passed down
          expect(traceparent).to.match(new RegExp(`00-${LEFT_PAD_16}[0-9a-f]{16}-[0-9a-f]{16}-00`));
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
        startRequest({ app: instanaAppControls, depth: 1, withInstanaHeaders: 'trace-in-progress' }).then(response => {
          const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
          return retryUntilSpansMatch(agentControls, spans => {
            const instanaHttpEntryRoot = verifyHttpEntry(
              spans,
              // Pass a dummy parent span to verifyHttpEntry, this verifies that the incoming X-INSTANA- headers
              // have been used.
              {
                t: upstreamInstanaTraceId,
                s: upstreamInstanaParentId
              },
              '/start',
              'none'
            );
            const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

            const instanaExitSpanId = instanaHttpExit.s;
            expect(traceparent).to.match(
              new RegExp(`00-${LEFT_PAD_16}${upstreamInstanaTraceId}-${instanaExitSpanId}-01`)
            );
            expect(tracestate).to.match(new RegExp(`in=${upstreamInstanaTraceId};${instanaExitSpanId}`));
          });
        }));

      it('Instana continues the Instana trace and spec trace', () =>
        startRequest({
          app: instanaAppControls,
          depth: 1,
          withSpecHeaders: 'valid',
          withInstanaHeaders: 'trace-in-progress'
        }).then(response => {
          const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
          return retryUntilSpansMatch(agentControls, spans => {
            const instanaHttpEntryRoot = verifyHttpEntry(
              spans,
              // Pass a dummy parent span to verifyHttpEntry, this verifies that the incoming X-INSTANA- headers
              // have been used.
              {
                t: upstreamInstanaTraceId,
                s: upstreamInstanaParentId
              },
              '/start',
              'none'
            );
            const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

            const instanaExitSpanId = instanaHttpExit.s;
            expect(traceparent).to.match(new RegExp(`00-${foreignTraceId}-${instanaExitSpanId}-01`));
            expect(tracestate).to.match(new RegExp(`in=${upstreamInstanaTraceId};${instanaExitSpanId}`));
          });
        }));

      it('Instana continues the Instana trace and spec trace', () =>
        startRequest({
          app: instanaAppControls,
          depth: 1,
          withSpecHeaders: 'not-sampled',
          withInstanaHeaders: 'trace-in-progress'
        }).then(response => {
          const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
          return retryUntilSpansMatch(agentControls, spans => {
            const instanaHttpEntryRoot = verifyHttpEntry(
              spans,
              // Pass a dummy parent span to verifyHttpEntry, this verifies that the incoming X-INSTANA- headers
              // have been used.
              {
                t: upstreamInstanaTraceId,
                s: upstreamInstanaParentId
              },
              '/start',
              'none'
            );
            const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');

            // The Instana-instrumented process receives sampled=0 but not X-INSTANA-L: 0, so we expect sampled=1 to be
            // passed down.
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
          withSpecHeaders: 'not-sampled',
          withInstanaHeaders: 'suppress'
        })
          .then(response => {
            expect(response.instanaHeaders).to.be.an('object');
            expect(response.instanaHeaders.t).to.not.exist;
            expect(response.instanaHeaders.s).to.not.exist;
            // X-INSTANA-L: 0 is passed down
            expect(response.instanaHeaders.l).to.equal('0');
            expect(response.w3cTaceContext).to.be.an('object');
            expect(response.w3cTaceContext.receivedHeaders).to.be.an('object');
            const traceparent = response.w3cTaceContext.receivedHeaders.traceparent;
            const tracestate = response.w3cTaceContext.receivedHeaders.tracestate;
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

      // First request to Instana has spec headers with sampled=1 and X-INSTANA-L. We expect no trace to be started
      // and X-INSTANA-L and spec headers with a new parent ID and sampled=0 to be passed down.
      it('Instana should not start a trace when receiving spec headers (sampled) and X-INSTANA-L=0', () =>
        startRequest({ app: instanaAppControls, depth: 1, withSpecHeaders: 'valid', withInstanaHeaders: 'suppress' })
          .then(response => {
            expect(response.instanaHeaders).to.be.an('object');
            expect(response.instanaHeaders.t).to.not.exist;
            expect(response.instanaHeaders.s).to.not.exist;
            // X-INSTANA-L: 0 is passed down
            expect(response.instanaHeaders.l).to.equal('0');
            expect(response.w3cTaceContext).to.be.an('object');
            expect(response.w3cTaceContext.receivedHeaders).to.be.an('object');
            const traceparent = response.w3cTaceContext.receivedHeaders.traceparent;
            const tracestate = response.w3cTaceContext.receivedHeaders.tracestate;
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
              expect(response.instanaHeaders).to.be.an('object');
              expect(response.instanaHeaders.t).to.not.exist;
              expect(response.instanaHeaders.s).to.not.exist;
              // X-INSTANA-L: 0 is passed down
              expect(response.instanaHeaders.l).to.equal('0');
              expect(response.w3cTaceContext).to.be.an('object');
              expect(response.w3cTaceContext.receivedHeaders).to.be.an('object');
              const traceparent = response.w3cTaceContext.receivedHeaders.traceparent;
              const tracestate = response.w3cTaceContext.receivedHeaders.tracestate;
              const traceParentMatch = new RegExp(`00-${LEFT_PAD_16}([0-9a-f]{16})-([0-9a-f]{16})-00`).exec(
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
    // The other vendor participates in the trace.We expect one continuous Instana trace, and the second Instana HTTP
    // entry span has foreign parent data.
    it('Instana should continue a trace after a detour via a participating service', () =>
      startRequest({ app: instanaAppControls, depth: 2 }).then(response => {
        const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
        return retryUntilSpansMatch(agentControls, spans => {
          const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', 'none');
          const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/continue');

          const instanaTraceId = instanaHttpEntryRoot.t;
          const instanaExitSpanId = instanaHttpExit.s;
          expect(traceparent).to.match(new RegExp(`00-${LEFT_PAD_16}${instanaTraceId}-[0-9a-f]{16}-01`));
          expect(tracestate).to.match(new RegExp(`other=newParentId,in=${instanaTraceId};${instanaExitSpanId}`));
          // The trace ID from the traceparent header should match then Instana trace ID (modulo left padding).
          const { traceIdFromTraceParent } = extraceIdsFromTraceParent(traceparent);
          expect(traceIdFromTraceParent).to.equal(LEFT_PAD_16 + instanaTraceId);

          verifyTraceContextAgainstTerminalSpan(response, spans, instanaHttpExit, instanaTraceId, 'other=newParentId');
        });
      }));

    // Instana -> Other Vendor -> Instana.
    // The other vendor only forwards the trace, but does not participate. We expect one continuous Instana trace, and
    // the second Instana HTTP entry span has foreign parent data.
    it('Instana should continue a trace after a detour via a forwarding service', () =>
      startRequest({ app: instanaAppControls, depth: 2, otherMode: 'forward' }).then(response => {
        const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
        return retryUntilSpansMatch(agentControls, spans => {
          const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', 'none');
          const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/continue');

          const instanaTraceId = instanaHttpEntryRoot.t;
          const instanaExitSpanId = instanaHttpExit.s;
          expect(traceparent).to.match(new RegExp(`00-${LEFT_PAD_16}${instanaTraceId}-${instanaExitSpanId}-01`));
          expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId}`));
          // The trace ID from the traceparent header should match then Instana trace ID (modulo left padding).
          const { traceIdFromTraceParent } = extraceIdsFromTraceParent(traceparent);
          expect(traceIdFromTraceParent).to.equal(LEFT_PAD_16 + instanaTraceId);

          verifyTraceContextAgainstTerminalSpan(response, spans, instanaHttpExit, instanaTraceId, undefined);
        });
      }));

    // Instana -> Other -> Instana.
    // Other soft-restarts trace, that is, it generates a new trace id and parent id for traceparent, but keeps the
    // old tracestate members around (which is an option the spec allows for "front gates into secure networks"). We
    // still expect one continuous Instana trace, and the second Instana HTTP entry span has foreign parent data.
    it('Instana should continue a trace after a detour when the foreign service has soft-restarted the trace', () =>
      startRequest({ app: instanaAppControls, depth: 2, otherMode: 'soft-restart' }).then(response => {
        const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
        return retryUntilSpansMatch(agentControls, spans => {
          const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', 'none');
          const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/continue');

          const instanaTraceId = instanaHttpEntryRoot.t;
          const instanaExitSpanId = instanaHttpExit.s;
          expect(tracestate).to.match(new RegExp(`^other=newParentId,in=${instanaTraceId};${instanaExitSpanId}$`));
          // Due to soft-restart, the traceparent's trace ID part shouldn't match the initial trace ID.
          const { traceIdFromTraceParent } = extraceIdsFromTraceParent(traceparent);
          expect(traceIdFromTraceParent).to.not.equal(LEFT_PAD_16 + instanaTraceId);
          verifyTraceContextAgainstTerminalSpan(response, spans, instanaHttpExit, instanaTraceId, 'other=newParentId');
        });
      }));

    // Instana -> Other -> Instana.
    // The other vendor hard-restarts the trace, that is, it generates a new trace id and parent id for traceparent,
    // and also discards the received tracestate header around. We do not expect one continuous Instana trace, but
    // rather two separate traces.
    it('The trace will break after a detour when the foreign service has hard-restarted the trace', () =>
      startRequest({ app: instanaAppControls, depth: 2, otherMode: 'hard-restart' }).then(response => {
        const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);

        return retryUntilSpansMatch(agentControls, spans => {
          const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', 'none');
          verifyHttpExit(spans, instanaHttpEntryRoot, '/continue');

          const instanaTraceId = instanaHttpEntryRoot.t;
          expect(tracestate).to.equal('other=newParentId');

          // The W3C trace context that was active during processing the last HTTP entry. This is different from
          // response.w3cTaceContext.receivedHeaders because we update the trace context (in particular, the parent
          // ID) after generating the span ID for this HTTP entry.
          expect(response.w3cTaceContext.active).to.be.an('object');
          const instanaTraceIdInActiveTraceContext = response.w3cTaceContext.active.instanaTraceId;
          const instanaParentIdInActiveTraceContext = response.w3cTaceContext.active.instanaParentId;
          expect(instanaTraceIdInActiveTraceContext).to.exist;
          expect(instanaParentIdInActiveTraceContext).to.exist;

          // Find the span for last HTTP entry in to the Instana-instrumented process.
          // In this case, the terminal HTTP entry span is not part of the same trace.
          const terminalHttpEntry = verifyHttpEntry(spans, null, '/end');

          expect(instanaTraceIdInActiveTraceContext).to.not.equal(instanaTraceId);
          // The span ID we put into the in key-value pair in the active trace context must equal the span ID on the
          // span.
          const instanaEntrySpanId = terminalHttpEntry.s;
          expect(instanaParentIdInActiveTraceContext).to.equal(instanaEntrySpanId);

          const { traceIdFromTraceParent, parentIdFromTraceParent } = extraceIdsFromTraceParent(traceparent);
          expect(traceIdFromTraceParent).not.contains(instanaTraceId);
          verifyForeignParentContext(terminalHttpEntry, parentIdFromTraceParent, instanaTraceId, 'other=newParentId');
        });
      }));

    it('the trace will break after a detour when the foreign service does not implement W3C trace context', () =>
      startRequest({ app: instanaAppControls, depth: 2, otherMode: 'non-compliant' }).then(response => {
        expect(response.w3cTaceContext).to.be.an('object');
        expect(response.w3cTaceContext.receivedHeaders).to.deep.equal({});

        return retryUntilSpansMatch(agentControls, spans => {
          const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/start', 'none');
          verifyHttpExit(spans, instanaHttpEntryRoot, '/continue');

          const instanaTraceId = instanaHttpEntryRoot.t;

          // The W3C trace context that was active during processing the last HTTP entry. This is different from
          // response.w3cTaceContext.receivedHeaders because we update the trace context (in particular, the parent
          // ID) after generating the span ID for this HTTP entry.
          expect(response.w3cTaceContext.active).to.be.an('object');
          const instanaTraceIdInActiveTraceContext = response.w3cTaceContext.active.instanaTraceId;
          const instanaParentIdInActiveTraceContext = response.w3cTaceContext.active.instanaParentId;
          expect(instanaTraceIdInActiveTraceContext).to.exist;
          expect(instanaParentIdInActiveTraceContext).to.exist;

          // Find the span for last HTTP entry in to the Instana-instrumented process.
          // In this case, the terminal HTTP entry span is not part of the same trace.
          const terminalHttpEntry = verifyHttpEntry(spans, null, '/end', 'none');

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
          const { traceparent } = verifySpecHeadersExistOnLastHttpRequest(response);
          const { traceIdFromTraceParent, parentIdFromTraceParent } = extraceIdsFromTraceParent(traceparent);
          const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/end');
          expect(instanaHttpEntryRoot.fp).to.be.an('object');
          expect(instanaHttpEntryRoot.fp.t).to.equal(traceIdFromTraceParent);
          expect(instanaHttpEntryRoot.fp.t).to.not.contain(instanaHttpEntryRoot.t);
          expect(instanaHttpEntryRoot.fp.p).to.equal(parentIdFromTraceParent);
          expect(instanaHttpEntryRoot.fp.p).to.not.equal(instanaHttpEntryRoot.s);
          expect(instanaHttpEntryRoot.fp.lts).to.equal('other=newParentId');
        })
      ));
  });

  describe('Other Vendor -> Instana -> Other Vendor', () => {
    it('Instana should pass down the correct spec headers', () =>
      startRequest({ app: otherVendorAppControls, depth: 2 }).then(response =>
        retryUntilSpansMatch(agentControls, spans => {
          const { traceparent, tracestate } = verifySpecHeadersExistOnLastHttpRequest(response);
          const { traceIdFromTraceParent } = extraceIdsFromTraceParent(traceparent);

          const instanaHttpEntryRoot = verifyHttpEntry(spans, null, '/continue');
          expect(instanaHttpEntryRoot.fp.t).to.equal(traceIdFromTraceParent);
          expect(instanaHttpEntryRoot.fp.lts).to.equal('other=newParentId');

          expect(traceparent).to.match(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

          const instanaHttpExit = verifyHttpExit(spans, instanaHttpEntryRoot, '/end');
          const instanaTraceId = instanaHttpEntryRoot.t;
          const instanaExitSpanId = instanaHttpExit.s;

          expect(tracestate).to.match(new RegExp(`in=${instanaTraceId};${instanaExitSpanId},other=newParentId`));
        })
      ));
  });
});

function startApps() {
  agentControls.registerTestHooks();
  const instanaAppControls = new ProcessControls({
    appPath: path.join(__dirname, 'app'),
    port: instanaAppPort,
    agentControls,
    env: {
      APM_VENDOR: 'instana',
      DOWNSTREAM_PORT: otherVendorAppPort
    }
  }).registerTestHooks();
  const otherVendorAppControls = new ProcessControls({
    appPath: path.join(__dirname, 'app'),
    port: otherVendorAppPort,
    // not passing agent controls because this app will not connect to the agent
    env: {
      APM_VENDOR: 'other-spec-compliant',
      DOWNSTREAM_PORT: instanaAppPort
    }
  }).registerTestHooks();

  return {
    instanaAppControls,
    otherVendorAppControls
  };
}

function startRequest({ app, depth = 2, withSpecHeaders = null, otherMode = 'participate', withInstanaHeaders }) {
  const request = {
    path: `/start?depth=${depth}&otherMode=${otherMode}`
  };
  if (withSpecHeaders === 'valid') {
    request.headers = {
      traceparent: `00-${foreignTraceId}-${foreignParentId}-01`,
      tracestate: 'thing=foo,bar=baz'
    };
  } else if (withSpecHeaders === 'not-sampled') {
    request.headers = {
      traceparent: `00-${foreignTraceId}-${foreignParentId}-00`,
      tracestate: 'thing=foo,bar=baz'
    };
  } else if (withSpecHeaders === 'too-new-traceparent') {
    request.headers = {
      traceparent: `01-${foreignTraceId}-${foreignParentId}-01-wait-there-is-more`,
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
  return app.sendRequest(request);
}

/**
 * This verification checks for some basic properties on the response, which is returned from the last HTTP response in
 * the chain.
 */
function verifySpecHeadersExistOnLastHttpRequest(response) {
  expect(response.w3cTaceContext).to.be.an('object');
  expect(response.w3cTaceContext.receivedHeaders).to.be.an('object');
  const traceparent = response.w3cTaceContext.receivedHeaders.traceparent;
  const tracestate = response.w3cTaceContext.receivedHeaders.tracestate;
  expect(traceparent).to.exist;
  expect(tracestate).to.exist;
  return { traceparent, tracestate };
}

/**
 * This verification will only happen for test scenarios where we have a call to the Instana-instrumented service at the
 * end. It basically verifies the incoming trace context headers and the internal trace context state that is used
 * during processing this last request, comparing it against with the meta data in the span representing this last call.
 */
function verifyTraceContextAgainstTerminalSpan(
  response,
  spans,
  instanaHttpExit,
  instanaTraceId,
  expectedMostRecentTraceStateMember,
  restart
) {
  // The incoming HTTP headers for the last request.
  const traceparent = response.w3cTaceContext.receivedHeaders.traceparent;

  // The W3C trace context that was active during processing the last HTTP entry. This is different from
  // response.w3cTaceContext.receivedHeaders because we update the trace context (in particular, the parent ID) after
  // generating the span ID for this HTTP entry.
  expect(response.w3cTaceContext.active).to.be.an('object');
  const instanaTraceIdInActiveTraceContext = response.w3cTaceContext.active.instanaTraceId;
  const instanaParentIdInActiveTraceContext = response.w3cTaceContext.active.instanaParentId;
  expect(instanaTraceIdInActiveTraceContext).to.exist;
  expect(instanaParentIdInActiveTraceContext).to.exist;

  // Find the span for last HTTP entry in to the Instana-instrumented process.
  const terminalHttpEntry = verifyHttpEntry(spans, instanaHttpExit, '/end');

  // The trace ID put into the in key-value pair in the active trace context must equal the trace ID on the span.
  expect(instanaTraceIdInActiveTraceContext).to.equal(instanaTraceId);
  // The span ID we put into the in key-value pair in the active trace context must equal the span ID on the span.
  const instanaEntrySpanId = terminalHttpEntry.s;
  expect(instanaParentIdInActiveTraceContext).to.equal(instanaEntrySpanId);

  const { parentIdFromTraceParent } = extraceIdsFromTraceParent(traceparent);

  verifyForeignParentContext(
    terminalHttpEntry,
    parentIdFromTraceParent,
    instanaTraceId,
    expectedMostRecentTraceStateMember,
    restart
  );
}

function verifyForeignParentContext(
  terminalHttpEntry,
  parentIdFromTraceParent,
  instanaTraceId,
  expectedMostRecentTraceStateMember,
  restart
) {
  const foreignParentContext = terminalHttpEntry.fp;
  expect(foreignParentContext).to.be.an('object');

  if (restart) {
    expect(foreignParentContext.t).to.equal(LEFT_PAD_16 + instanaTraceId);
  }
  expect(foreignParentContext.p).to.equal(parentIdFromTraceParent);
  if (expectedMostRecentTraceStateMember) {
    expect(foreignParentContext.lts).to.equal(expectedMostRecentTraceStateMember);
  } else {
    expect(foreignParentContext.lts).to.be.undefined;
  }
}

function extraceIdsFromTraceParent(traceparent) {
  const traceParentMatch = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/.exec(traceparent);
  const traceIdFromTraceParent = traceParentMatch[1];
  const parentIdFromTraceParent = traceParentMatch[2];
  return { traceIdFromTraceParent, parentIdFromTraceParent };
}

function verifyHttpEntry(spans, parentSpan, url, foreignParent) {
  return expectAtLeastOneMatching(spans, span => {
    expect(span.n).to.equal('node.http.server');
    expect(span.k).to.equal(constants.ENTRY);
    expect(span.async).to.not.exist;
    expect(span.error).to.not.exist;
    expect(span.ec).to.equal(0);
    expect(span.t).to.be.a('string');
    expect(span.s).to.be.a('string');
    if (parentSpan) {
      expect(span.t).to.equal(parentSpan.t);
      expect(span.p).to.equal(parentSpan.s);
    } else {
      expect(span.p).to.not.exist;
    }
    expect(span.data.http.method).to.equal('GET');
    expect(span.data.http.url).to.equal(url);
    expect(span.data.http.host).to.equal(`127.0.0.1:${instanaAppPort}`);
    expect(span.data.http.status).to.equal(200);

    if (typeof foreignParent === 'object') {
      expect(span.fp).to.deep.equal(foreignParent);
    } else if (foreignParent === 'none') {
      expect(span.fp).to.not.exist;
    }
  });
}

function verifyHttpExit(spans, parentSpan, url) {
  return expectAtLeastOneMatching(spans, span => {
    expect(span.n).to.equal('node.http.client');
    expect(span.k).to.equal(constants.EXIT);
    expect(span.async).to.not.exist;
    expect(span.error).to.not.exist;
    expect(span.ec).to.equal(0);
    expect(span.t).to.be.a('string');
    expect(span.s).to.be.a('string');
    expect(span.p).to.equal(parentSpan.s);
    expect(span.data.http.method).to.equal('GET');
    expect(span.data.http.url).to.match(RegExp(`^.*:${otherVendorAppPort}${url}$`));
    expect(span.data.http.status).to.equal(200);
    expect(span.fp).to.not.exist;
  });
}
