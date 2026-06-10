/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');

const otlpConverter = require('../../../../src/metrics/converters/otlp');
const converter = require('../../../../src/metrics/converters/otlp/converter');

describe('metrics/converters/otlp', () => {
  function loadInputFixture(filename) {
    const fixturePath = path.join(__dirname, 'fixtures/input', filename);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  function loadOutputFixture(filename) {
    const fixturePath = path.join(__dirname, 'fixtures/output', filename);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  beforeEach(() => {
    converter.setHostId(null);
    converter.setPid(null);
  });

  describe('converter', () => {
    describe('basic conversion', () => {
      it('should convert nested metrics object to OTLP format', () => {
        const input = loadInputFixture('nested-metrics.json');
        const expectedOutput = loadOutputFixture('nested-metrics-output.json');

        converter.setHostId('host-abc-123');
        converter.setPid('12345');

        const result = converter.transform(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('should convert array of metrics to OTLP format', () => {
        const input = loadInputFixture('simple-metrics.json');
        const expectedOutput = loadOutputFixture('simple-metrics-output.json');

        const result = converter.transform(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('should return empty resourceMetrics for empty input', () => {
        const result = converter.transform([]);
        expect(result).to.deep.equal({ resourceMetrics: [] });
      });

      it('should return empty resourceMetrics for null input', () => {
        const result = converter.transform(null);
        expect(result).to.deep.equal({ resourceMetrics: [] });
      });

      it('should return empty resourceMetrics for undefined input', () => {
        const result = converter.transform(undefined);
        expect(result).to.deep.equal({ resourceMetrics: [] });
      });
    });

    describe('metric value types', () => {
      it('should handle number values as sum', () => {
        const input = [{ name: 'test.metric', value: 42.5 }];
        const result = converter.transform(input);

        const metric = result.resourceMetrics[0].scopeMetrics[0].metrics[0];
        expect(metric).to.have.property('sum');
        expect(metric.sum.dataPoints[0].asDouble).to.equal(42.5);
      });

      it('should handle boolean values as gauge', () => {
        const input = [{ name: 'test.flag', value: true }];
        const result = converter.transform(input);

        const metric = result.resourceMetrics[0].scopeMetrics[0].metrics[0];
        expect(metric).to.have.property('gauge');
        expect(metric.gauge.dataPoints[0].asDouble).to.equal(1);
      });

      it('should handle string values as gauge with attribute', () => {
        const input = [{ name: 'test.status', value: 'active' }];
        const result = converter.transform(input);

        const metric = result.resourceMetrics[0].scopeMetrics[0].metrics[0];
        expect(metric).to.have.property('gauge');
        expect(metric.gauge.dataPoints[0].attributes).to.be.an('array');
        expect(metric.gauge.dataPoints[0].attributes[0].value.stringValue).to.equal('active');
      });
    });

    describe('resource grouping', () => {
      it('should group metrics by resource', () => {
        const input = [
          { name: 'metric1', value: 10, from: { e: '111', h: 'host1' } },
          { name: 'metric2', value: 20, from: { e: '111', h: 'host1' } },
          { name: 'metric3', value: 30, from: { e: '222', h: 'host2' } }
        ];

        const result = converter.transform(input);

        expect(result.resourceMetrics).to.have.lengthOf(2);

        // First resource should have 2 metrics
        expect(result.resourceMetrics[0].scopeMetrics[0].metrics).to.have.lengthOf(2);

        // Second resource should have 1 metric
        expect(result.resourceMetrics[1].scopeMetrics[0].metrics).to.have.lengthOf(1);
      });
    });

    describe('cached resource attributes', () => {
      it('should use cached hostId when from field is missing', () => {
        converter.setHostId('cached-host');
        converter.setPid('9999');

        const input = [{ name: 'test.metric', value: 100 }];
        const result = converter.transform(input);

        const attributes = result.resourceMetrics[0].resource.attributes;
        const hostAttr = attributes.find(attr => attr.key === 'host.name');
        expect(hostAttr.value.stringValue).to.equal('cached-host');

        const pidAttr = attributes.find(attr => attr.key === 'process.pid');
        expect(pidAttr.value.intValue).to.equal(9999);
      });

      it('should prefer from field over cached values', () => {
        converter.setHostId('cached-host');
        converter.setPid('9999');

        const input = [
          {
            name: 'test.metric',
            value: 100,
            from: { e: '1234', h: 'from-host' }
          }
        ];
        const result = converter.transform(input);

        const attributes = result.resourceMetrics[0].resource.attributes;
        const hostAttr = attributes.find(attr => attr.key === 'host.name');
        expect(hostAttr.value.stringValue).to.equal('from-host');

        const pidAttr = attributes.find(attr => attr.key === 'process.pid');
        expect(pidAttr.value.intValue).to.equal(1234);
      });
    });
  });

  describe('index (entry point)', () => {
    it('should export transform function', () => {
      expect(otlpConverter.transform).to.be.a('function');
    });

    it('should export setHostId function', () => {
      expect(otlpConverter.setHostId).to.be.a('function');
    });

    it('should export setPid function', () => {
      expect(otlpConverter.setPid).to.be.a('function');
    });

    it('should export init function', () => {
      expect(otlpConverter.init).to.be.a('function');
    });

    it('should handle errors gracefully and return empty result', () => {
      // Pass invalid data that might cause an error
      const result = otlpConverter.transform({ invalid: { deeply: { nested: { circular: null } } } });

      // Should not throw, should return valid structure
      expect(result).to.have.property('resourceMetrics');
      expect(result.resourceMetrics).to.be.an('array');
    });
  });
});
