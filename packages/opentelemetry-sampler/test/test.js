/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { expect } = require('chai');

const chai = require('chai');
const semver = require('semver');
const chaiSpies = require('chai-spies');
const { getTestTimeout } = require('@instana/core/test/config');
const { supportedVersion } = require('@instana/core').tracing;
const { retry } = require('@instana/core/test/test_util');
const { Control } = require('./Control');

chai.use(chaiSpies);

let mochaSuiteFn;

// NOTE: Tests are broken for Node v10 since https://github.com/instana/nodejs/pull/758
//       Instead of 7 spans we only receive 6 spans.
//       There is currently no need to investigate.
if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '12.0.0')) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

mochaSuiteFn('Instana OpenTelemetry Sampler', function () {
  this.timeout(getTestTimeout() * 3);

  describe('should trace & export into Instana format', function () {
    const backendPort = 10455;
    const appControls = new Control({
      backendPort,
      startBackend: true,
      otelAppPath: './test/app',
      env: {
        INSTANA_DISABLE_CA_CHECK: 'true',
        PORT: 8215,
        INSTANA_ENDPOINT_URL: `https://localhost:${backendPort}/`,
        INSTANA_AGENT_KEY: 'some key'
      }
    });

    appControls.registerTestHooks();

    it('when tracing is not suppressed', async () => {
      await appControls.sendRequest({
        path: '/otel-test',
        suppressTracing: false,
        extraHeaders: {
          'X-INSTANA-T': '80f198ee56343ba864fe8b2a57d3eff7',
          'X-INSTANA-S': 'e457b5a2e4d86bd1'
        }
      });

      await retry(async () => {
        const spans = await appControls.getSpans();
        const spanNames = [
          'middleware - query',
          'middleware - expressInit',
          'request handler - /otel-test',
          'tcp.connect',
          'tls.connect',
          'GET',
          'GET /otel-test'
        ];
        expect(spanNames).to.eql(spans.map(s => s.data.operation));
        expect(spans.length).to.eql(7);
      }, 500);
    });
  });

  describe('should trace with Otel format', function () {
    const exporterEndpoint = 'http://example.com';
    const backendPort = 10455;
    const appControls = new Control({
      backendPort,
      startBackend: true,
      otelAppPath: './test/app',
      env: {
        INSTANA_DISABLE_CA_CHECK: 'true',
        PORT: 8215,
        INSTANA_ENDPOINT_URL: `https://localhost:${backendPort}/`,
        INSTANA_AGENT_KEY: 'some key',
        OTEL_EXPORTER_OTLP_ENDPOINT: exporterEndpoint,
        OTEL_EXPORTER_OTLP_INSECURE: 'true'
      }
    });

    appControls.registerTestHooks();

    it('when tracing is not suppressed', async () => {
      await appControls.sendRequest({
        path: '/otel-test',
        suppressTracing: false,
        extraHeaders: {
          'X-INSTANA-T': '80f198ee56343ba864fe8b2a57d3eff7',
          'X-INSTANA-S': 'e457b5a2e4d86bd1'
        }
      });

      const resp = await appControls.sendRequest({
        path: '/get-otel-spans',
        suppressTracing: true
      });
      const spanNames = [
        'middleware - query',
        'middleware - expressInit',
        'request handler - /otel-test',
        'tcp.connect',
        'tls.connect',
        'GET',
        'GET /otel-test'
      ];
      expect(spanNames).to.eql(resp.spans.map(s => s.name));
      expect(resp.spans.length).to.be.gte(7);
    });
  });

  describe('should not trace with Otel format', function () {
    const exporterEndpoint = 'http://example.com';
    const backendPort = 10455;
    const appControls = new Control({
      backendPort,
      startBackend: true,
      otelAppPath: './test/app',
      env: {
        INSTANA_DISABLE_CA_CHECK: 'true',
        PORT: 8215,
        INSTANA_ENDPOINT_URL: `https://localhost:${backendPort}/`,
        INSTANA_AGENT_KEY: 'some key',
        OTEL_EXPORTER_OTLP_ENDPOINT: exporterEndpoint,
        OTEL_EXPORTER_OTLP_INSECURE: 'true'
      }
    });

    appControls.registerTestHooks();

    it('when tracing is suppressed', async () => {
      await appControls.sendRequest({
        path: '/otel-test',
        suppressTracing: true
      });

      const resp = await appControls.sendRequest({
        path: '/get-otel-spans',
        suppressTracing: true
      });

      expect(resp.spans.length).to.eql(0);
    });
  });

  describe('should not trace', function () {
    const backendPort = 10455;
    const appControls = new Control({
      backendPort,
      startBackend: true,
      otelAppPath: './test/app',
      env: {
        INSTANA_DISABLE_CA_CHECK: 'true',
        PORT: 8215,
        INSTANA_ENDPOINT_URL: `https://localhost:${backendPort}/`,
        INSTANA_AGENT_KEY: 'some key'
      }
    });

    appControls.registerTestHooks();

    it('when tracing is suppressed', async () => {
      await appControls.sendRequest({
        path: '/otel-test',
        suppressTracing: true
      });

      await retry(async () => {
        const spans = await appControls.getSpans();
        expect(spans.length).to.eql(0);
      }, 500);
    });
  });
});
