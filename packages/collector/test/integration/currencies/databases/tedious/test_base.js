/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const {
  retry,
  verifyHttpRootEntry,
  verifyExitSpan,
  delay,
  expectExactlyOneMatching
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
  describe('tracing/tedious', function () {
    this.timeout(config.getTestTimeout() * 2.5);

    globalAgent.setUpCleanUpHooks();

    const libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };

    ['latest', 'v1.3.0'].forEach(otelApiVersion => {
      describe(`@opentelemetry/api version: ${otelApiVersion}`, function () {
        describe('opentelemetry is enabled', function () {
          let controls;

          // Azure connection can take up to 1-2 minutes if db is in paused state
          this.timeout(1000 * 60 * 2);

          before(async () => {
            controls = new ProcessControls({
              dirname: __dirname,
              appName: 'tedious-app',
              useGlobalAgent: true,
              enableOtelIntegration: true,
              env: {
                ...libraryEnv,
                OTEL_API_VERSION: otelApiVersion
              }
            });

            await controls.startAndWaitForAgentConnection(5000, Date.now() + 1000 * 60 * 2);
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await controls.stop();
          });

          const sendRequestAndVerifySpans = (method, endpoint, expectedStatement) =>
            controls
              .sendRequest({
                method,
                path: endpoint
              })
              .then(() => delay(DELAY_TIMEOUT_IN_MS))
              .then(() =>
                retry(() =>
                  agentControls.getSpans().then(spans => {
                    expect(spans.length).to.equal(2);

                    const httpEntry = verifyHttpRootEntry({
                      spans,
                      apiPath: endpoint,
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
                        const queryType = endpoint === '/packages/batch' ? 'execSqlBatch' : 'execSql';
                        expect(span.data.tags.name).to.eql(`${queryType} azure-nodejs-test`);

                        expect(span.data.operation).to.equal('tedious');
                        expect(span.data.tags['db.system']).to.eql('mssql');
                        expect(span.data.tags['db.name']).to.eql('azure-nodejs-test');
                        expect(span.data.tags['db.user']).to.eql('admin@instana@nodejs-team-db-server');
                        expect(span.data.tags['db.statement']).to.eql(expectedStatement);
                        expect(span.data.tags['net.peer.name']).to.eql('nodejs-team-db-server.database.windows.net');
                        checkTelemetryResourceAttrs(span);
                      }
                    });
                  })
                )
              );
          it('should trace select queries', () =>
            sendRequestAndVerifySpans('GET', '/packages', 'SELECT * FROM packages'));
          it('should trace batch queries', function (done) {
            sendRequestAndVerifySpans(
              'POST',
              '/packages/batch',
              "\n  INSERT INTO packages (id, name, version) VALUES (11, 'BatchPackage1', 1);\n  " +
                "INSERT INTO packages (id, name, version) VALUES (11, 'BatchPackage2', 2);\n"
            )
              .then(() => {
                done();
              })
              .catch(err => done(err));
          });
          it('should trace delete queries', () =>
            sendRequestAndVerifySpans('DELETE', '/packages', 'DELETE FROM packages WHERE id = 11'));

          it('[suppressed] should not trace', () =>
            controls
              .sendRequest({
                method: 'GET',
                path: '/packages',
                suppressTracing: true
              })
              .then(() => delay(DELAY_TIMEOUT_IN_MS))
              .then(() => retry(() => agentControls.getSpans().then(spans => expect(spans).to.be.empty))));
        });

        describe('opentelemetry is disabled', function () {
          let controls;

          before(async () => {
            controls = new ProcessControls({
              dirname: __dirname,
              appName: 'tedious-app',
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
          it('should not trace', () => {
            controls
              .sendRequest({
                method: 'GET',
                path: '/packages'
              })
              .then(() => delay(DELAY_TIMEOUT_IN_MS))
              .then(() =>
                retry(() => {
                  return agentControls.getSpans().then(spans => {
                    expect(spans).to.be.empty;
                  });
                })
              );
          });
        });
      });
    });
  });
};
