/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');
const otlpTransformer = require('../../src/otlpTransformer');

describe('otlpTransformer', () => {
  describe('getExportTarget', () => {
    function init(otlpConfig) {
      otlpTransformer.init({ tracing: { otlp: otlpConfig } });
    }

    it('should resolve path and port for a signal', () => {
      init({ enabled: true, port: 4318 });

      expect(otlpTransformer.getExportTarget('traces')).to.deep.equal({
        path: '/v1/traces',
        port: 4318
      });
      expect(otlpTransformer.getExportTarget('logs').path).to.equal('/v1/logs');
      expect(otlpTransformer.getExportTarget('metrics').path).to.equal('/v1/metrics');
    });

    it('should add url and headers if an endpoint is configured', () => {
      init({ enabled: true, port: 4318, endpoint: 'https://otlp.example.com:4318/prefix', headers: { a: 'b' } });

      expect(otlpTransformer.getExportTarget('logs')).to.deep.equal({
        path: '/v1/logs',
        port: 4318,
        url: 'https://otlp.example.com:4318/prefix/v1/logs',
        headers: { a: 'b' }
      });
    });

    it('should not produce a double slash if the endpoint has a trailing slash', () => {
      init({ port: 4318, endpoint: 'http://localhost:4318/' });

      expect(otlpTransformer.getExportTarget('traces').url).to.equal('http://localhost:4318/v1/traces');
    });

    it('should read the new config after activate', () => {
      init({ enabled: false, port: 4318 });
      expect(otlpTransformer.getExportTarget('traces').url).to.not.exist;

      otlpTransformer.activate({
        tracing: { otlp: { enabled: true, port: 4999, endpoint: 'http://localhost:4318', headers: { a: 'b' } } }
      });

      expect(otlpTransformer.getExportTarget('traces')).to.deep.equal({
        path: '/v1/traces',
        port: 4999,
        url: 'http://localhost:4318/v1/traces',
        headers: { a: 'b' }
      });
    });

    it('should not fail with an empty otlp config', () => {
      init({});

      expect(otlpTransformer.getExportTarget('traces')).to.deep.equal({ path: '/v1/traces', port: undefined });
    });
  });
});
