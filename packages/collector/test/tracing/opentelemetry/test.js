/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const semver = require('semver');
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../core/test/config');
const constants = require('@instana/core').tracing.constants;

const {
  retry,
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyIntermediateSpan,
  verifyEntrySpan,
  expectExactlyNMatching,
  delay,
  expectExactlyOneMatching
} = require('../../../../core/test/test_util');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');
const DELAY_TIMEOUT_IN_MS = 500;

const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '14.0.0') ? describe : describe.skip;

mochaSuiteFn('opentelemetry/instrumentations', function () {
  this.timeout(config.getTestTimeout());

  describe('restify', function () {
    // No support for Node v18 yet.
    // https://github.com/restify/node-restify/issues/1925
    // https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1339
    const skip = semver.lt(process.versions.node, '18.0.0') !== true;
    if (skip) return it.skip(`skipping ${process.versions.node}`);

    describe('opentelemetry is enabled', function () {
      globalAgent.setUpCleanUpHooks();
      const agentControls = globalAgent.instance;

      const controls = new ProcessControls({
        appPath: path.join(__dirname, './restify-app'),
        useGlobalAgent: true
      });

      ProcessControls.setUpHooks(controls);

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
                    expect(span.data.tags['restify.version']).to.eql('8.6.1');
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

                ['parseAccept', 'parseQueryString', 'readBody', 'parseBody'].forEach(name => {
                  verifyIntermediateSpan({
                    spanName: 'otel',
                    spans,
                    parent: httpEntry,
                    withError: false,
                    pid: String(controls.getPid()),
                    dataProperty: 'tags',
                    extraTests: span => {
                      expect(span.data.tags.name).to.eql(`middleware - ${name}`);
                      expect(span.data.tags['restify.name']).to.eql(name);
                      expect(span.data.tags['restify.version']).to.eql('8.6.1');
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
                    expect(span.data.tags['restify.version']).to.eql('8.6.1');
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

      it('[suppressed] should not trace', () =>
        controls
          .sendRequest({
            method: 'GET',
            path: '/test',
            suppressTracing: true
          })
          .then(() => delay(DELAY_TIMEOUT_IN_MS))
          .then(() => retry(() => agentControls.getSpans().then(spans => expect(spans).to.be.empty))));
    });

    describe('opentelemetry is disabled', function () {
      globalAgent.setUpCleanUpHooks();
      const agentControls = globalAgent.instance;

      const controls = new ProcessControls({
        appPath: path.join(__dirname, './restify-app'),
        useGlobalAgent: true,
        env: {
          INSTANA_DISABLE_USE_OPENTELEMETRY: true
        }
      });

      ProcessControls.setUpHooks(controls);

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

  describe('fs', function () {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const controls = new ProcessControls({
      appPath: path.join(__dirname, './fs-app'),
      useGlobalAgent: true
    });

    ProcessControls.setUpHooks(controls);

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

  describe('socket.io', function () {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const server = new ProcessControls({
      appPath: path.join(__dirname, './socketio-server'),
      useGlobalAgent: true
    });
    const client = new ProcessControls({
      appPath: path.join(__dirname, './socketio-client'),
      useGlobalAgent: true
    });

    ProcessControls.setUpHooks(server, client);

    it('should trace', () =>
      server
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
                pid: String(server.getPid())
              });

              verifyEntrySpan({
                spanName: 'otel',
                spans,
                withError: false,
                pid: String(server.getPid()),
                dataProperty: 'tags',
                extraTests: span => {
                  expect(span.data.tags.name).to.contain('test_reply receive');
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
                pid: String(server.getPid()),
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

    it('should trace', () =>
      server
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
                pid: String(server.getPid())
              });

              verifyExitSpan({
                spanName: 'otel',
                spans,
                parent: httpEntry,
                withError: false,
                pid: String(server.getPid()),
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
      server
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

function checkTelemetryResourceAttrs(span) {
  expect(span.data.resource['telemetry.sdk.language']).to.eql('nodejs');
  expect(span.data.resource['telemetry.sdk.name']).to.eql('opentelemetry');
  expect(span.data.resource['telemetry.sdk.version']).to.match(/1\.\d+\.\d/);
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
