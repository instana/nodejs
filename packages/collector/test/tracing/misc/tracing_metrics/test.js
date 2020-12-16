'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;

const config = require('../../../../../core/test/config');
const delay = require('../../../../../core/test/test_util/delay');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

describe('tracing/tracing metrics', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout() * 2);
  const retryTimeout = this.timeout() * 0.8;

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('when tracing is enabled', function() {
    const controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true
    }).registerTestHooks();

    it('must send internal tracing metrics to agent', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/create-spans'
        })
        .then(response => {
          expect(response).to.equal('OK');
          return testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              const httpEntry = expectHttpEntry(spans, '/create-spans');
              expectExit(spans, httpEntry, 'exit-1');
              expectExit(spans, httpEntry, 'exit-2');
              expectExit(spans, httpEntry, 'exit-3');
            })
          );
        })
        .then(() =>
          testUtils.retry(
            () =>
              agentControls.getTracingMetrics().then(tracingMetrics => {
                expect(tracingMetrics).to.have.lengthOf.at.least(3);
                expectCumulativeTracingMetrics(tracingMetrics, controls.getPid(), 4, 4, 0);
              }),
            retryTimeout
          )
        ));

    it('must reveal non-finished spans', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/create-unfinished-spans'
        })
        .then(response => {
          expect(response).to.equal('OK');
          return testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              const httpEntry = expectHttpEntry(spans, '/create-unfinished-spans');
              expectExit(spans, httpEntry, 'exit-1');
            })
          );
        })
        .then(() =>
          testUtils.retry(
            () =>
              agentControls.getTracingMetrics().then(tracingMetrics => {
                expect(tracingMetrics).to.have.lengthOf.at.least(3);
                expectCumulativeTracingMetrics(tracingMetrics, controls.getPid(), 3, 2, 0);
              }),
            retryTimeout
          )
        ));
  });

  describe('when INSTANA_TRACER_METRICS_INTERVAL is configured explicitly', () => {
    const controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        INSTANA_TRACER_METRICS_INTERVAL: 100
      }
    }).registerTestHooks();

    it('must send internal tracing metrics every 100 ms', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/create-spans'
        })
        .then(response => {
          expect(response).to.equal('OK');
          return testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              const httpEntry = expectHttpEntry(spans, '/create-spans');
              expectExit(spans, httpEntry, 'exit-1');
              expectExit(spans, httpEntry, 'exit-2');
              expectExit(spans, httpEntry, 'exit-3');
            })
          );
        })
        .then(() => delay(1000))
        .then(() =>
          testUtils.retry(() =>
            agentControls.getTracingMetrics().then(tracingMetrics => {
              expect(tracingMetrics).to.have.lengthOf.at.least(10);
            })
          )
        ));
  });

  describe('when tracing is not enabled', () => {
    const controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      tracingEnabled: false
    }).registerTestHooks();

    it('must not collect any tracing metrics', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/create-spans'
        })
        .then(response => {
          expect(response).to.equal('OK');
          return testUtils.retry(
            () =>
              agentControls.getTracingMetrics().then(tracingMetrics => {
                expect(tracingMetrics).to.have.lengthOf.at.least(3);
                expectCumulativeTracingMetrics(tracingMetrics, controls.getPid(), 0, 0, 0);
              }),
            retryTimeout
          );
        }));
  });

  describe('when dropping spans', () => {
    const customeAgentControls = require('../../../apps/agentStubControls');
    customeAgentControls.registerTestHooks({
      // The trace endpoint will return an HTTP error code, triggering the removeSpansIfNecessary function.
      rejectTraces: true
    });
    const controls = new ProcessControls({
      dirname: __dirname,
      agentControls: customeAgentControls,
      tracingEnabled: true,
      env: {
        FORCE_TRANSMISSION_STARTING_AT: 500,
        MAX_BUFFERED_SPANS: 1
      }
    }).registerTestHooks();

    it('must reveal dropped spans', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/create-spans'
        })
        .then(response => {
          expect(response).to.equal('OK');
          return testUtils.retry(
            () =>
              customeAgentControls.getTracingMetrics().then(tracingMetrics => {
                expect(tracingMetrics).to.have.lengthOf.at.least(3);
                // With maxSpanBuffer = 1 we always keep 1 span in the buffer which is not dropped,  the test creates
                // 4 spans overall (one http entry and three SDK exits), hence we only expect three dropped spans.
                expectCumulativeTracingMetrics(tracingMetrics, controls.getPid(), 4, 4, 3);
              }),
            retryTimeout
          );
        }));
  });

  describe('when agent does not support the tracermetrics endpoint', () => {
    const customeAgentControls = require('../../../apps/agentStubControls');
    customeAgentControls.registerTestHooks({
      tracingMetrics: false
    });
    const controls = new ProcessControls({
      dirname: __dirname,
      agentControls: customeAgentControls,
      tracingEnabled: true,
      env: {
        INSTANA_TRACER_METRICS_INTERVAL: 100
      }
    }).registerTestHooks();

    it('must not call POST /tracermetrics multiple times', () =>
      controls
        .sendRequest({
          method: 'POST',
          path: '/create-spans'
        })
        .then(response => {
          expect(response).to.equal('OK');
          return testUtils.retry(() =>
            customeAgentControls.getSpans().then(spans => {
              const httpEntry = expectHttpEntry(spans, '/create-spans');
              expectExit(spans, httpEntry, 'exit-1');
              expectExit(spans, httpEntry, 'exit-2');
              expectExit(spans, httpEntry, 'exit-3');
            })
          );
        })
        // Wait a bit to give the tracer a chance to call POST /tracermetrics multiple times (which it should not, but
        // we need to make sure the not only passes because we terminated it to soon).
        // Note that we configured INSTANA_TRACER_METRICS_INTERVAL=100 so waiting 500 ms should be plenty.
        .then(() => delay(500))
        .then(() =>
          customeAgentControls.getTracingMetrics().then(tracingMetrics => {
            // Make sure the tracer only called the tracermetrics endpoint once and then stopped doing that after
            // receiving an HTTP 404.
            expect(tracingMetrics).to.have.lengthOf(1);
          })
        ));
  });
});

function expectCumulativeTracingMetrics(tracingMetrics, expectedPid, expectedOpened, expectedClosed, expectedDropped) {
  let actualOpened = 0;
  let actualClosed = 0;
  let actualDropped = 0;
  tracingMetrics.forEach(data => {
    expect(data.tracer).to.not.exist;
    expect(data.pid).to.equal(expectedPid);
    actualOpened += data.metrics.opened;
    actualClosed += data.metrics.closed;
    actualDropped += data.metrics.dropped;
  });
  expect(actualOpened).to.equal(expectedOpened);
  expect(actualClosed).to.equal(expectedClosed);
  expect(actualDropped).to.equal(expectedDropped);
}

function expectHttpEntry(spans, url) {
  return testUtils.expectAtLeastOneMatching(spans, [
    span => expect(span.n).to.equal('node.http.server'),
    span => expect(span.data.http.method).to.equal('POST'),
    span => expect(span.data.http.url).to.equal(url)
  ]);
}

function expectExit(spans, parentSpan, expectedName) {
  return testUtils.expectAtLeastOneMatching(spans, [
    span => expect(span.t).to.equal(parentSpan.t),
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.n).to.equal('sdk'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.data.sdk).to.exist,
    span => expect(span.data.sdk.type).to.equal('exit'),
    span => expect(span.data.sdk.name).to.equal(expectedName)
  ]);
}
