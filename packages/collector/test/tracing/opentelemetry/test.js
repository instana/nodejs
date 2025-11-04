/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const semver = require('semver');
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const constants = require('@instana/core').tracing.constants;
const config = require('../../../../core/test/config');
const portfinder = require('../../test_util/portfinder');
const { execSync } = require('child_process');
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
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

const runTests =
  supportedVersion(process.versions.node) && semver.satisfies(process.versions.node, '<=23.x')
    ? describe
    : describe.skip;

mochaSuiteFn.only('opentelemetry/instrumentations', function () {
  this.timeout(config.getTestTimeout() * 2);

  before(() => {
    if (process.env.INSTANA_TEST_SKIP_INSTALLING_DEPS === 'true') {
      return;
    }

    execSync('rm -rf ./extra/node_modules', { cwd: __dirname, stdio: 'inherit' });

    execSync('rm -rf ./core.tgz ./collector.tgz', { cwd: __dirname, stdio: 'inherit' });

    execSync('./preinstall.sh', { cwd: __dirname, stdio: 'inherit' });

    execSync('npm install --no-save --no-package-lock --prefix ./', {
      cwd: path.join(__dirname, './extra'),
      stdio: 'inherit'
    });
  });

  describe('when openTelemetry initialized first', function () {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    let controls;
    before(async () => {
      controls = new ProcessControls({
        appPath: path.join(__dirname, './extra/app'),
        useGlobalAgent: true,
        cwd: __dirname,
        env: {
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
                  expect(span.data.tags.name).to.eql('fs statSync');
                  checkTelemetryResourceAttrs(span);
                }
              });
            })
          );
        }));
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
