/*
 * (c) Copyright IBM Corp. 2023
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

function checkTelemetryResourceAttrs(span) {
  expect(span.data.resource['service.name']).to.not.exist;
  expect(span.data.resource['telemetry.sdk.language']).to.eql('nodejs');
  expect(span.data.resource['telemetry.sdk.name']).to.eql('opentelemetry');
  expect(span.data.resource['telemetry.sdk.version']).to.match(/2\.\d+\.\d/);
}

module.exports = function (name, version, isLatest) {
  describe('tracing/fs (otel)', function () {
    this.timeout(config.getTestTimeout() * 2.5);

    globalAgent.setUpCleanUpHooks();

    const libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };

    ['latest', 'v1.3.0'].forEach(otelApiVersion => {
      describe(`@opentelemetry/api version: ${otelApiVersion}`, function () {
        let controls;

        before(async () => {
          controls = new ProcessControls({
            dirname: __dirname,
            appName: 'fs-app',
            useGlobalAgent: true,
            enableOtelIntegration: true,
            env: { ...libraryEnv, OTEL_API_VERSION: otelApiVersion }
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

        it('should trace when there is no otel parent', () =>
          controls
            .sendRequest({
              method: 'GET',
              path: '/fsread'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(2);

                  const httpEntry = verifyHttpRootEntry({
                    spans,
                    apiPath: '/fsread',
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
                      expect(span.data.operation).to.eql('fs');
                      checkTelemetryResourceAttrs(span);
                    }
                  });
                })
              )
            ));

        it('should trace when there is an otel parent', () =>
          controls
            .sendRequest({
              method: 'GET',
              path: '/fsread2'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(3);

                  const httpEntry = verifyHttpRootEntry({
                    spans,
                    apiPath: '/fsread2',
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
                      expect(span.data.tags.name).to.eql('fs statSync');
                      checkTelemetryResourceAttrs(span);
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
                      expect(span.data.tags.name).to.eql('fs readFileSync');
                      checkTelemetryResourceAttrs(span);
                    }
                  });
                })
              )
            ));

        it('[suppressed] should not trace', () =>
          controls
            .sendRequest({
              method: 'GET',
              path: '/fsread',
              suppressTracing: true
            })
            .then(() => delay(DELAY_TIMEOUT_IN_MS))
            .then(() => retry(() => agentControls.getSpans().then(spans => expect(spans).to.be.empty))));
      });
    });
  });
};
