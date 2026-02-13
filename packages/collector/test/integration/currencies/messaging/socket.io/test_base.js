/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const config = require('@_local/core/test/config');
const portfinder = require('@_local/collector/test/test_util/portfinder');
const {
  retry,
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyEntrySpan,
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
  describe('tracing/socket.io', function () {
    this.timeout(config.getTestTimeout() * 2.5);

    globalAgent.setUpCleanUpHooks();

    const libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };

    ['latest', 'v1.3.0'].forEach(otelApiVersion => {
      describe(`@opentelemetry/api version: ${otelApiVersion}`, function () {
        let socketIOServerPort;
        let serverControls;
        let clientControls;

        before(async () => {
          socketIOServerPort = portfinder();

          serverControls = new ProcessControls({
            dirname: __dirname,
            appName: 'socketio-server',
            useGlobalAgent: true,
            enableOtelIntegration: true,
            env: {
              ...libraryEnv,
              SOCKETIOSERVER_PORT: socketIOServerPort,
              OTEL_API_VERSION: otelApiVersion
            }
          });

          clientControls = new ProcessControls({
            dirname: __dirname,
            appName: 'socketio-client',
            useGlobalAgent: true,
            enableOtelIntegration: true,
            env: {
              ...libraryEnv,
              SOCKETIOSERVER_PORT: socketIOServerPort,
              OTEL_API_VERSION: otelApiVersion
            }
          });

          await clientControls.startAndWaitForAgentConnection();
          await serverControls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await serverControls.stop();
          await clientControls.stop();
        });

        it('should trace emit', () =>
          serverControls
            .sendRequest({
              method: 'GET',
              path: '/io-emit'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(3);

                  const httpEntry = verifyHttpRootEntry({
                    spans,
                    apiPath: '/io-emit',
                    pid: String(serverControls.getPid())
                  });

                  verifyEntrySpan({
                    spanName: 'otel',
                    spans,
                    withError: false,
                    pid: String(serverControls.getPid()),
                    dataProperty: 'tags',
                    extraTests: span => {
                      expect(span.data.operation).to.equal('socket.io');
                      expect(span.data.tags.name).to.contain('receive');
                      expect(span.data.tags['messaging.system']).to.eql('socket.io');
                      expect(span.data.tags['messaging.destination']).to.eql('ON test_reply');
                      expect(span.data.tags['messaging.operation']).to.eql('receive');
                      expect(span.data.tags['messaging.socket.io.event_name']).to.eql('test_reply');

                      checkTelemetryResourceAttrs(span);
                    }
                  });

                  verifyExitSpan({
                    spanName: 'otel',
                    spans,
                    parent: httpEntry,
                    withError: false,
                    pid: String(serverControls.getPid()),
                    dataProperty: 'tags',
                    extraTests: span => {
                      expect(span.data.tags.name).to.contain('send');
                      expect(span.data.tags['messaging.system']).to.eql('socket.io');
                      expect(span.data.tags['messaging.destination_kind']).to.eql('topic');
                      expect(span.data.tags['messaging.socket.io.event_name']).to.eql('test');
                      expect(span.data.tags['messaging.socket.io.namespace']).to.eql('/');
                      expect(span.data.tags['messaging.destination']).to.eql('EMIT test');

                      checkTelemetryResourceAttrs(span);
                    }
                  });
                })
              )
            ));

        it('should trace send', () =>
          serverControls
            .sendRequest({
              method: 'GET',
              path: '/io-send'
            })
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(2);

                  const httpEntry = verifyHttpRootEntry({
                    spans,
                    apiPath: '/io-send',
                    pid: String(serverControls.getPid())
                  });

                  verifyExitSpan({
                    spanName: 'otel',
                    spans,
                    parent: httpEntry,
                    withError: false,
                    pid: String(serverControls.getPid()),
                    dataProperty: 'tags',
                    extraTests: span => {
                      expect(span.data.tags.name).to.contain('send');
                      expect(span.data.tags['messaging.system']).to.eql('socket.io');
                      expect(span.data.tags['messaging.destination_kind']).to.eql('topic');
                      expect(span.data.tags['messaging.socket.io.event_name']).to.eql('message');
                      expect(span.data.tags['messaging.socket.io.namespace']).to.eql('/');
                      expect(span.data.tags['messaging.destination']).to.eql('EMIT message');

                      checkTelemetryResourceAttrs(span);
                    }
                  });
                })
              )
            ));

        it('[suppressed] should not trace', () =>
          serverControls
            .sendRequest({
              method: 'GET',
              path: '/io-emit',
              suppressTracing: true
            })
            .then(() => delay(DELAY_TIMEOUT_IN_MS))
            .then(() =>
              retry(() =>
                agentControls.getSpans().then(spans => {
                  // We cannot forward the headers because socket.io does not support headers
                  expect(spans.length).to.eql(1);
                })
              )
            ));
      });
    });
  });
};
