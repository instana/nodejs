/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const expect = require('chai').expect;
const config = require('@_local/core/test/config');
const {
  retry,
  verifyHttpRootEntry,
  verifyExitSpan,
  delay
} = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const DELAY_TIMEOUT_IN_MS = 500;
const agentControls = globalAgent.instance;

function checkTelemetryResourceAttrs(span, otelSdkVersion = /1\.\d+\.\d/) {
  expect(span.data.resource['service.name']).to.not.exist;
  expect(span.data.resource['telemetry.sdk.language']).to.eql('nodejs');
  expect(span.data.resource['telemetry.sdk.name']).to.eql('opentelemetry');
  expect(span.data.resource['telemetry.sdk.version']).to.match(otelSdkVersion);
}

module.exports = function (name, version, isLatest) {
  describe('when otel sdk and instana is enabled', function () {
    this.timeout(config.getTestTimeout() * 4);

    globalAgent.setUpCleanUpHooks();

    const libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };

    describe('when openTelemetry initialized first', function () {
      let controls;
      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          enableOtelIntegration: true,
          env: {
            ...libraryEnv,
            COLLECTOR_FIRST: 'false'
          }
        });

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
      });

      it('should trace with both Instana and OpenTelemetry SDK', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/otel-sdk-fs'
          })
          .then(response => {
            // Verify otel spans in the response
            expect(response.success).to.be.true;
            expect(response.otelspan).to.be.an('object');
            expect(response.otelspan.name).to.eql('explicit-otel-operation');
            expect(response.otelspan._spanContext).to.have.property('traceId');
            expect(response.otelspan._spanContext).to.have.property('spanId');
            expect(response.otelspan.instrumentationLibrary).to.be.an('object');
            expect(response.otelspan.instrumentationLibrary.name).to.eql('otel-sdk-app-tracer');

            return retry(() =>
              agentControls.getSpans().then(spans => {
                expect(spans.length).to.equal(3);

                const httpEntry = verifyHttpRootEntry({
                  spans,
                  apiPath: '/otel-sdk-fs',
                  pid: String(controls.getPid())
                });

                verifyExitSpan({
                  spanName: 'otel',
                  spans,
                  parent: httpEntry,
                  withError: false,
                  pid: String(controls.getPid()),
                  dataProperty: 'tags',
                  extraTests: span => {
                    expect(span.data.tags.name).to.eql('fs readFileSync');

                    // This test uses a global OpenTelemetry SDK instance, which still uses sdk version v1.
                    // Its nice to keep it like that to proof that v1 and v2 work fine with our integration.
                    checkTelemetryResourceAttrs(span, /1\.\d+\.\d/);
                  }
                });

                verifyExitSpan({
                  spanName: 'otel',
                  spans,
                  parent: httpEntry,
                  withError: false,
                  pid: String(controls.getPid()),
                  dataProperty: 'tags',
                  extraTests: span => {
                    expect(span.data.tags.name).to.eql('fs statSync');
                    checkTelemetryResourceAttrs(span, /1\.\d+\.\d/);
                  }
                });
              })
            );
          }));

      it('[suppressed] should not trace', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/otel-sdk-fs',
            suppressTracing: true
          })
          .then(() => delay(DELAY_TIMEOUT_IN_MS))
          .then(() => retry(() => agentControls.getSpans().then(spans => expect(spans).to.be.empty))));
    });

    describe('when Collector initialized first', function () {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          enableOtelIntegration: true,
          env: {
            ...libraryEnv,
            COLLECTOR_FIRST: 'true'
          }
        });

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
      });

      // TODO: There's a current limitation with the OpenTelemetry integration.
      // When Instana is initialized first, our tracing doesn't function correctly.
      // OpenTelemetry tracing continues to work, but our tracing does not.
      // This issue needs to be resolved in a future update.
      it('should trace with OpenTelemetry SDK spans and should not trace Instana spans', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/otel-sdk-fs'
          })
          .then(response => {
            // Verify otel spans in the response
            expect(response.success).to.be.true;
            expect(response.otelspan).to.be.an('object');
            expect(response.otelspan.name).to.eql('explicit-otel-operation');
            expect(response.otelspan._spanContext).to.have.property('traceId');
            expect(response.otelspan._spanContext).to.have.property('spanId');
            expect(response.otelspan.instrumentationScope).to.be.an('object');
            expect(response.otelspan.instrumentationScope.name).to.eql('otel-sdk-app-tracer');
          })
          .then(() => delay(DELAY_TIMEOUT_IN_MS))
          .then(() =>
            retry(() =>
              agentControls.getSpans().then(spans => {
                // our tracing should not capture spans
                expect(spans).to.be.empty;
              })
            )
          ));

      it('[suppressed] should not trace', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/otel-sdk-fs',
            suppressTracing: true
          })
          .then(() => delay(DELAY_TIMEOUT_IN_MS))
          .then(() => retry(() => agentControls.getSpans().then(spans => expect(spans).to.be.empty))));
    });
  });
};
