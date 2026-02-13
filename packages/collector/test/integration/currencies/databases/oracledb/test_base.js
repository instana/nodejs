/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const expect = require('chai').expect;
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
  describe('tracing/OracleDB', function () {
    this.timeout(1000 * 60 * 2);

    globalAgent.setUpCleanUpHooks();

    const libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };

    ['latest', 'v1.3.0'].forEach(otelApiVersion => {
      describe(`@opentelemetry/api version: ${otelApiVersion}`, function () {
        describe('opentelemetry is enabled', function () {
          let controls;

          before(async () => {
            controls = new ProcessControls({
              dirname: __dirname,
              appName: 'oracle-app',
              useGlobalAgent: true,
              enableOtelIntegration: true,
              env: { ...libraryEnv, OTEL_API_VERSION: otelApiVersion }
            });

            await controls.startAndWaitForAgentConnection(5000, Date.now() + 1000 * 60 * 2);
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await controls.stop();
          });

          it('should trace', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/trace'
            });

            await retry(async () => {
              const spans = await agentControls.getSpans();
              expect(spans.length).to.equal(2);

              const httpEntry = verifyHttpRootEntry({
                spans,
                apiPath: '/trace',
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
                  expect(span.data.operation).to.equal('oracle');
                  expect(span.data.tags.name).to.eql('oracledb.Connection.execute');
                  expect(span.data.tags['db.system.name']).to.eql('oracle.db');
                  expect(span.data.tags['server.address']).to.eql('localhost');
                  checkTelemetryResourceAttrs(span);
                }
              });
            });
          });

          it('[suppressed] should not trace', async () => {
            return controls
              .sendRequest({
                method: 'GET',
                path: '/trace',
                suppressTracing: true
              })
              .then(() => delay(DELAY_TIMEOUT_IN_MS))
              .then(() => {
                return retry(async () => {
                  const spans = await agentControls.getSpans();
                  expect(spans).to.be.empty;
                });
              });
          });
        });

        describe('opentelemetry is disabled', function () {
          let controls;

          before(async () => {
            controls = new ProcessControls({
              dirname: __dirname,
              appName: 'oracle-app',
              useGlobalAgent: true,
              enableOtelIntegration: false,
              env: {
                ...libraryEnv,
                OTEL_API_VERSION: otelApiVersion
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

          it('should trace instana spans only', () =>
            controls
              .sendRequest({
                method: 'GET',
                path: '/trace'
              })
              .then(() =>
                retry(() =>
                  agentControls.getSpans().then(spans => {
                    expect(spans.length).to.equal(1);

                    verifyHttpRootEntry({
                      spans,
                      apiPath: '/trace',
                      pid: String(controls.getPid())
                    });
                  })
                )
              ));
        });
      });
    });
  });
};
