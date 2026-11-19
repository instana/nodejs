/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');
const otlpExporter = require('../../src/otlpExporter');

describe('otlpExporter', () => {
  describe('getExportTarget', () => {
    it('should resolve path and port for a signal', () => {
      expect(otlpExporter.getExportTarget({ enabled: true, port: 4318 }, 'traces')).to.deep.equal({
        path: '/v1/traces',
        port: 4318
      });
      expect(otlpExporter.getExportTarget({ enabled: true, port: 4318 }, 'logs').path).to.equal('/v1/logs');
      expect(otlpExporter.getExportTarget({ enabled: true, port: 4318 }, 'metrics').path).to.equal('/v1/metrics');
    });

    it('should add url and headers if an endpoint is configured', () => {
      expect(
        otlpExporter.getExportTarget(
          { enabled: true, port: 4318, endpoint: 'https://otlp.example.com:4318/prefix', headers: { a: 'b' } },
          'logs'
        )
      ).to.deep.equal({
        path: '/v1/logs',
        port: 4318,
        url: 'https://otlp.example.com:4318/prefix/v1/logs',
        headers: { a: 'b' }
      });
    });

    it('should not produce a double slash if the endpoint has a trailing slash', () => {
      const target = otlpExporter.getExportTarget({ port: 4318, endpoint: 'http://localhost:4318/' }, 'traces');
      expect(target.url).to.equal('http://localhost:4318/v1/traces');
    });

    it('should not fail without otlp config', () => {
      expect(otlpExporter.getExportTarget(undefined, 'traces')).to.deep.equal({ path: '/v1/traces', port: undefined });
    });
  });
});
