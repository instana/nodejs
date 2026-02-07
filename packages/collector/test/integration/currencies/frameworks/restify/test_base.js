/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const {
  retry,
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyIntermediateSpan,
  expectExactlyNMatching,
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

function verifyHttpExit(spans, parentSpan) {
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
    span => expect(span.data.http.status).to.equal(200),
    span => expect(span.fp).to.not.exist
  ]);
}

// TODO: Restify test is broken in v24. See Issue: https://github.com/restify/node-restify/issues/1984
module.exports = function (name, version, isLatest) {
  const restifyTest = semver.gte(process.versions.node, '24.0.0') ? describe.skip : describe;

  restifyTest('tracing/restify', function () {
    this.timeout(config.getTestTimeout() * 2.5);

    globalAgent.setUpCleanUpHooks();

    const libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };

    ['latest', 'v1.3.0'].forEach(otelApiVersion => {
      describe(`@opentelemetry/api version: ${otelApiVersion}`, function () {
        describe('opentelemetry is enabled', function () {
          let controls;

          before(async () => {
            controls = new ProcessControls({
              dirname: __dirname,
              appName: 'restify-app',
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

          it('should trace', () =>
            controls
              .sendRequest({
                method: 'GET',
                path: '/test'
              })
              .then(() =>
                retry(() =>
                  agentControls.getSpans().then(spans => {
                    expect(spans.length).to.equal(8);

                    const httpEntry = verifyHttpRootEntry({
                      spans,
                      apiPath: '/test',
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
                        expect(span.data.tags.name).to.eql('request handler - /test');
                        expect(span.data.operation).to.equal('restify');
                        expect(span.data.tags['restify.version']).to.eql('11.1.0');
                        expect(span.data.tags['restify.type']).to.eql('request_handler');
                        expect(span.data.tags['restify.method']).to.eql('get');
                        expect(span.data.tags['http.route']).to.eql('/test');

                        checkTelemetryResourceAttrs(span);
                      }
                    });

                    verifyIntermediateSpan({
                      spanName: 'otel',
                      spans,
                      parent: httpEntry,
                      withError: false,
                      pid: String(controls.getPid()),
                      dataProperty: 'tags',
                      testMethod: expectExactlyNMatching,
                      n: 4
                    });

                    ['parseAccept', 'parseQueryString', 'readBody', 'parseBody'].forEach(mwName => {
                      verifyIntermediateSpan({
                        spanName: 'otel',
                        spans,
                        parent: httpEntry,
                        withError: false,
                        pid: String(controls.getPid()),
                        dataProperty: 'tags',
                        extraTests: span => {
                          expect(span.data.tags.name).to.eql(`middleware - ${mwName}`);
                          expect(span.data.tags['restify.name']).to.eql(mwName);
                          expect(span.data.tags['restify.version']).to.eql('11.1.0');
                          expect(span.data.tags['restify.type']).to.eql('middleware');
                          expect(span.data.tags['restify.method']).to.eql('use');
                          expect(span.data.tags['http.route']).to.eql('/test');

                          checkTelemetryResourceAttrs(span);
                        }
                      });
                    });

                    verifyExitSpan({
                      spanName: 'otel',
                      spans,
                      parent: httpEntry,
                      withError: false,
                      pid: String(controls.getPid()),
                      dataProperty: 'tags',
                      extraTests: span => {
                        expect(span.data.tags.name).to.eql('request handler - /test');
                        expect(span.data.tags['restify.name']).to.not.exist;
                        expect(span.data.tags['restify.version']).to.eql('11.1.0');
                        expect(span.data.tags['restify.type']).to.eql('request_handler');
                        expect(span.data.tags['restify.method']).to.eql('get');
                        expect(span.data.tags['http.route']).to.eql('/test');

                        checkTelemetryResourceAttrs(span);
                      }
                    });

                    verifyExitSpan({
                      spanName: 'postgres',
                      spans,
                      parent: httpEntry,
                      withError: false,
                      pid: String(controls.getPid()),
                      dataProperty: 'pg'
                    });

                    verifyHttpExit(spans, httpEntry);
                  })
                )
              ));

          it('[suppressed] should not trace', async () => {
            return controls
              .sendRequest({
                method: 'GET',
                path: '/test',
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
              appName: 'restify-app',
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
                path: '/test'
              })
              .then(() =>
                retry(() =>
                  agentControls.getSpans().then(spans => {
                    expect(spans.length).to.equal(3);

                    const httpEntry = verifyHttpRootEntry({
                      spans,
                      apiPath: '/test',
                      pid: String(controls.getPid())
                    });

                    verifyExitSpan({
                      spanName: 'postgres',
                      spans,
                      parent: httpEntry,
                      withError: false,
                      pid: String(controls.getPid()),
                      dataProperty: 'pg'
                    });

                    verifyHttpExit(spans, httpEntry);
                  })
                )
              ));
        });
      });
    });
  });
};
