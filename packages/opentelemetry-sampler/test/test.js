/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { expect } = require('chai');
const { getTestTimeout } = require('@_local/core/test/config');
const { supportedVersion } = require('@_local/core').tracing;
const { retry } = require('@_local/core/test/test_util');
const { Control } = require('./Control');

let mochaSuiteFn;

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

mochaSuiteFn('Instana OpenTelemetry Sampler', function () {
  this.timeout(getTestTimeout() * 3);

  describe('should trace & export into Instana format', function () {
    let appControls;

    before(async () => {
      appControls = new Control({
        startBackend: true,
        otelAppPath: './test/app',
        env: {
          INSTANA_DISABLE_CA_CHECK: 'true',
          INSTANA_AGENT_KEY: 'some key'
        }
      });

      await appControls.start();
    });

    beforeEach(async () => {
      await appControls.reset();
      await appControls.resetBackendSpans();
    });

    after(async () => {
      await appControls.stop();
    });

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
        const spanNames = ['tcp.connect', 'tls.connect', 'request handler - /otel-test', 'GET /otel-test', 'GET'];
        expect(spans.map(s => s.data.operation)).to.have.members(spanNames);
        expect(spans.length).to.eql(5);
      });
    });
  });

  describe('should trace with Otel format', function () {
    const exporterEndpoint = 'http://example.com';

    let appControls;

    before(async () => {
      appControls = new Control({
        startBackend: true,
        otelAppPath: './test/app',
        env: {
          INSTANA_DISABLE_CA_CHECK: 'true',
          INSTANA_AGENT_KEY: 'some key',
          OTEL_EXPORTER_OTLP_ENDPOINT: exporterEndpoint,
          OTEL_EXPORTER_OTLP_INSECURE: 'true'
        }
      });

      await appControls.start();
    });

    beforeEach(async () => {
      await appControls.reset();
      await appControls.resetBackendSpans();
    });

    after(async () => {
      await appControls.stop();
    });

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

      const spanNames = ['tcp.connect', 'tls.connect', 'request handler - /otel-test', 'GET /otel-test', 'GET'];
      expect(resp.spans.map(s => s.name)).to.have.members(spanNames);
      expect(resp.spans.length).to.be.gte(5);
    });
  });

  describe('should not trace with Otel format', function () {
    const exporterEndpoint = 'http://example.com';

    let appControls;

    before(async () => {
      appControls = new Control({
        startBackend: true,
        otelAppPath: './test/app',
        env: {
          INSTANA_DISABLE_CA_CHECK: 'true',
          INSTANA_AGENT_KEY: 'some key',
          OTEL_EXPORTER_OTLP_ENDPOINT: exporterEndpoint,
          OTEL_EXPORTER_OTLP_INSECURE: 'true'
        }
      });

      await appControls.start();
    });

    beforeEach(async () => {
      await appControls.reset();
      await appControls.resetBackendSpans();
    });

    after(async () => {
      await appControls.stop();
    });

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
    let appControls;

    before(async () => {
      appControls = new Control({
        startBackend: true,
        otelAppPath: './test/app',
        env: {
          INSTANA_DISABLE_CA_CHECK: 'true',
          INSTANA_AGENT_KEY: 'some key'
        }
      });

      await appControls.start();
    });

    beforeEach(async () => {
      await appControls.reset();
      await appControls.resetBackendSpans();
    });

    after(async () => {
      await appControls.stop();
    });

    it('when tracing is suppressed', async () => {
      await appControls.sendRequest({
        path: '/otel-test',
        suppressTracing: true
      });

      await retry(async () => {
        const spans = await appControls.getSpans();
        expect(spans.length).to.eql(0);
      });
    });
  });
});
