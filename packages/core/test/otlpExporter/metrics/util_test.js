/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { flattenObject, normalizeMetrics, getResourceKey } = require('../../../src/otlpExporter/metrics/util');

describe('otlpExporter/metrics/util', () => {
  describe('getResourceKey', () => {
    it('should generate key from host and entity', () => {
      const from = { h: 'host123', e: 'entity456' };
      const key = getResourceKey(from);

      expect(key).to.equal('h:host123|e:entity456');
    });

    it('should handle missing host', () => {
      const from = { e: 'entity456' };
      const key = getResourceKey(from);

      expect(key).to.equal('h:empty|e:entity456');
    });

    it('should handle missing entity', () => {
      const from = { h: 'host123' };
      const key = getResourceKey(from);

      expect(key).to.equal('h:host123|e:empty');
    });

    it('should handle both missing', () => {
      const from = {};
      const key = getResourceKey(from);

      expect(key).to.equal('h:empty|e:empty');
    });

    it('should handle null input', () => {
      const key = getResourceKey(null);

      expect(key).to.equal('h:empty|e:empty');
    });

    it('should handle undefined input', () => {
      const key = getResourceKey(undefined);

      expect(key).to.equal('h:empty|e:empty');
    });

    it('should handle numeric values', () => {
      const from = { h: 123, e: 456 };
      const key = getResourceKey(from);

      expect(key).to.equal('h:123|e:456');
    });

    it('should create unique keys for different resources', () => {
      const key1 = getResourceKey({ h: 'host1', e: 'entity1' });
      const key2 = getResourceKey({ h: 'host2', e: 'entity2' });

      expect(key1).to.not.equal(key2);
    });

    it('should create same key for identical resources', () => {
      const key1 = getResourceKey({ h: 'host1', e: 'entity1' });
      const key2 = getResourceKey({ h: 'host1', e: 'entity1' });

      expect(key1).to.equal(key2);
    });
  });

  describe('flattenObject', () => {
    describe('basic flattening', () => {
      it('should flatten simple nested object', () => {
        const obj = {
          level1: {
            level2: 'value'
          }
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          'level1.level2': 'value'
        });
      });

      it('should flatten multiple properties at same level', () => {
        const obj = {
          a: 1,
          b: 2,
          c: 3
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          a: 1,
          b: 2,
          c: 3
        });
      });

      it('should flatten deeply nested object', () => {
        const obj = {
          level1: {
            level2: {
              level3: {
                value: 42
              }
            }
          }
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          'level1.level2.level3.value': 42
        });
      });

      it('should flatten mixed depth properties', () => {
        const obj = {
          shallow: 'value1',
          deep: {
            nested: {
              value: 'value2'
            }
          }
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          shallow: 'value1',
          'deep.nested.value': 'value2'
        });
      });
    });

    describe('data type handling', () => {
      it('should include number values', () => {
        const obj = {
          count: 42,
          nested: {
            value: 100
          }
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          count: 42,
          'nested.value': 100
        });
      });

      it('should include string values', () => {
        const obj = {
          name: 'test',
          nested: {
            description: 'nested test'
          }
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          name: 'test',
          'nested.description': 'nested test'
        });
      });

      it('should include boolean values', () => {
        const obj = {
          enabled: true,
          nested: {
            active: false
          }
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          enabled: true,
          'nested.active': false
        });
      });

      it('should exclude null values', () => {
        const obj = {
          valid: 'value',
          invalid: null
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          valid: 'value'
        });
      });

      it('should exclude undefined values', () => {
        const obj = {
          valid: 'value',
          invalid: undefined
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          valid: 'value'
        });
      });

      it('should exclude array values', () => {
        const obj = {
          valid: 'value',
          array: [1, 2, 3]
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          valid: 'value'
        });
      });

      it('should handle zero as valid number', () => {
        const obj = {
          count: 0
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          count: 0
        });
      });

      it('should handle empty string as valid value', () => {
        const obj = {
          name: ''
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          name: ''
        });
      });
    });

    describe('edge cases', () => {
      it('should return empty object for null input', () => {
        const result = flattenObject(null);

        expect(result).to.deep.equal({});
      });

      it('should return empty object for undefined input', () => {
        const result = flattenObject(undefined);

        expect(result).to.deep.equal({});
      });

      it('should return empty object for non-object input', () => {
        const result = flattenObject('string');

        expect(result).to.deep.equal({});
      });

      it('should return empty object for empty object', () => {
        const result = flattenObject({});

        expect(result).to.deep.equal({});
      });

      it('should handle object with only null values', () => {
        const obj = {
          a: null,
          b: null
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({});
      });

      it('should handle nested empty objects', () => {
        const obj = {
          level1: {
            level2: {}
          }
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({});
      });
    });

    describe('prefix parameter', () => {
      it('should use prefix when provided', () => {
        const obj = {
          value: 42
        };

        const result = flattenObject(obj, 'prefix');

        expect(result).to.deep.equal({
          'prefix.value': 42
        });
      });

      it('should chain prefixes for nested objects', () => {
        const obj = {
          nested: {
            value: 42
          }
        };

        const result = flattenObject(obj, 'prefix');

        expect(result).to.deep.equal({
          'prefix.nested.value': 42
        });
      });
    });

    describe('real-world metrics scenarios', () => {
      it('should flatten CPU metrics', () => {
        const obj = {
          cpu: {
            user: 45.5,
            system: 12.3,
            idle: 42.2
          }
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          'cpu.user': 45.5,
          'cpu.system': 12.3,
          'cpu.idle': 42.2
        });
      });

      it('should flatten memory metrics', () => {
        const obj = {
          memory: {
            used: 1024000,
            free: 512000,
            total: 1536000
          }
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          'memory.used': 1024000,
          'memory.free': 512000,
          'memory.total': 1536000
        });
      });

      it('should flatten nested service metrics', () => {
        const obj = {
          service: {
            http: {
              requests: 1000,
              errors: 5
            },
            db: {
              queries: 500,
              slow: 10
            }
          }
        };

        const result = flattenObject(obj);

        expect(result).to.deep.equal({
          'service.http.requests': 1000,
          'service.http.errors': 5,
          'service.db.queries': 500,
          'service.db.slow': 10
        });
      });
    });
  });

  describe('normalizeMetrics', () => {
    describe('array input', () => {
      it('should normalize array of metric objects', () => {
        const metrics = [
          { name: 'cpu.usage', value: 45.5, timestamp: 1000 },
          { name: 'memory.used', value: 1024, timestamp: 1000 }
        ];

        const result = normalizeMetrics(metrics);

        expect(result).to.be.an('array');
        expect(result).to.have.lengthOf(2);
        expect(result[0]).to.deep.equal({
          name: 'cpu.usage',
          value: 45.5,
          timestamp: 1000,
          unit: '',
          from: undefined
        });
      });

      it('should add default timestamp when missing', () => {
        const metrics = [{ name: 'cpu.usage', value: 45.5 }];

        const result = normalizeMetrics(metrics);

        expect(result[0].timestamp).to.equal(0);
      });

      it('should add default unit when missing', () => {
        const metrics = [{ name: 'cpu.usage', value: 45.5, timestamp: 1000 }];

        const result = normalizeMetrics(metrics);

        expect(result[0].unit).to.equal('');
      });

      it('should preserve unit when provided', () => {
        const metrics = [{ name: 'cpu.usage', value: 45.5, timestamp: 1000, unit: 'percent' }];

        const result = normalizeMetrics(metrics);

        expect(result[0].unit).to.equal('percent');
      });

      it('should preserve from property', () => {
        const metrics = [{ name: 'cpu.usage', value: 45.5, timestamp: 1000, from: { h: 'host1', e: 'entity1' } }];

        const result = normalizeMetrics(metrics);

        expect(result[0].from).to.deep.equal({ h: 'host1', e: 'entity1' });
      });

      it('should filter out null entries', () => {
        const metrics = [{ name: 'cpu.usage', value: 45.5 }, null, { name: 'memory.used', value: 1024 }];

        const result = normalizeMetrics(metrics);

        expect(result).to.have.lengthOf(2);
        expect(result[0].name).to.equal('cpu.usage');
        expect(result[1].name).to.equal('memory.used');
      });

      it('should filter out undefined entries', () => {
        const metrics = [{ name: 'cpu.usage', value: 45.5 }, undefined, { name: 'memory.used', value: 1024 }];

        const result = normalizeMetrics(metrics);

        expect(result).to.have.lengthOf(2);
      });

      it('should handle empty array', () => {
        const result = normalizeMetrics([]);

        expect(result).to.deep.equal([]);
      });

      it('should handle array with all null values', () => {
        const metrics = [null, null, null];

        const result = normalizeMetrics(metrics);

        expect(result).to.deep.equal([]);
      });
    });

    describe('object input', () => {
      it('should normalize simple object to array of metrics', () => {
        const metrics = {
          cpu: 45.5,
          memory: 1024,
          timestamp: 1000
        };

        const result = normalizeMetrics(metrics);

        expect(result).to.be.an('array');
        expect(result).to.have.lengthOf(2);

        const cpuMetric = result.find(m => m.name === 'cpu');
        expect(cpuMetric).to.exist;
        expect(cpuMetric.value).to.equal(45.5);
        expect(cpuMetric.timestamp).to.equal(1000);
      });

      it('should flatten nested object properties', () => {
        const metrics = {
          cpu: {
            user: 45.5,
            system: 12.3
          },
          timestamp: 1000
        };

        const result = normalizeMetrics(metrics);

        expect(result).to.be.an('array');
        expect(result).to.have.lengthOf(2);

        const userMetric = result.find(m => m.name === 'cpu.user');
        expect(userMetric).to.exist;
        expect(userMetric.value).to.equal(45.5);
      });

      it('should use fallback timestamp from object', () => {
        const metrics = {
          cpu: 45.5,
          timestamp: 1000
        };

        const result = normalizeMetrics(metrics);

        expect(result[0].timestamp).to.equal(1000);
      });

      it('should use default timestamp when not provided', () => {
        const metrics = {
          cpu: 45.5
        };

        const result = normalizeMetrics(metrics);

        expect(result[0].timestamp).to.equal(0);
      });

      it('should preserve from property', () => {
        const metrics = {
          cpu: 45.5,
          from: { h: 'host1', e: 'entity1' },
          timestamp: 1000
        };

        const result = normalizeMetrics(metrics);

        expect(result[0].from).to.deep.equal({ h: 'host1', e: 'entity1' });
      });

      it('should exclude timestamp and from from metric names', () => {
        const metrics = {
          cpu: 45.5,
          memory: 1024,
          timestamp: 1000,
          from: { h: 'host1' }
        };

        const result = normalizeMetrics(metrics);

        const names = result.map(m => m.name);
        expect(names).to.not.include('timestamp');
        expect(names).to.not.include('from');
      });

      it('should handle deeply nested metrics', () => {
        const metrics = {
          service: {
            http: {
              requests: 1000
            }
          },
          timestamp: 1000
        };

        const result = normalizeMetrics(metrics);

        const metric = result.find(m => m.name === 'service.http.requests');
        expect(metric).to.exist;
        expect(metric.value).to.equal(1000);
      });

      it('should set empty unit for all metrics', () => {
        const metrics = {
          cpu: 45.5,
          memory: 1024
        };

        const result = normalizeMetrics(metrics);

        result.forEach(metric => {
          expect(metric.unit).to.equal('');
        });
      });
    });

    describe('edge cases', () => {
      it('should return empty array for null input', () => {
        const result = normalizeMetrics(null);

        expect(result).to.deep.equal([]);
      });

      it('should return empty array for undefined input', () => {
        const result = normalizeMetrics(undefined);

        expect(result).to.deep.equal([]);
      });

      it('should return empty array for non-object, non-array input', () => {
        const result = normalizeMetrics('string');

        expect(result).to.deep.equal([]);
      });

      it('should return empty array for number input', () => {
        const result = normalizeMetrics(42);

        expect(result).to.deep.equal([]);
      });

      it('should return empty array for boolean input', () => {
        const result = normalizeMetrics(true);

        expect(result).to.deep.equal([]);
      });

      it('should handle object with only metadata (no metrics)', () => {
        const metrics = {
          timestamp: 1000,
          from: { h: 'host1' }
        };

        const result = normalizeMetrics(metrics);

        expect(result).to.deep.equal([]);
      });
    });

    describe('real-world scenarios', () => {
      it('should normalize collector metrics payload', () => {
        const metrics = {
          name: 'my-service',
          cpu: {
            user: 45.5,
            system: 12.3
          },
          memory: {
            used: 1024000,
            free: 512000
          },
          timestamp: 1234567890,
          from: { h: 'host123', e: 'pid456' }
        };

        const result = normalizeMetrics(metrics);

        expect(result).to.be.an('array');
        expect(result.length).to.be.greaterThan(0);

        result.forEach(metric => {
          expect(metric).to.have.property('name');
          expect(metric).to.have.property('value');
          expect(metric).to.have.property('timestamp');
          expect(metric).to.have.property('unit');
          expect(metric).to.have.property('from');
          expect(metric.timestamp).to.equal(1234567890);
          expect(metric.from).to.deep.equal({ h: 'host123', e: 'pid456' });
        });
      });

      it('should normalize array-based metrics from agent', () => {
        const metrics = [
          {
            name: 'nodejs.heap.used',
            value: 50000000,
            timestamp: 1234567890,
            unit: 'bytes',
            from: { h: 'host123', e: 'pid456' }
          },
          {
            name: 'nodejs.heap.total',
            value: 100000000,
            timestamp: 1234567890,
            unit: 'bytes',
            from: { h: 'host123', e: 'pid456' }
          }
        ];

        const result = normalizeMetrics(metrics);

        expect(result).to.have.lengthOf(2);
        expect(result[0].name).to.equal('nodejs.heap.used');
        expect(result[0].unit).to.equal('bytes');
        expect(result[1].name).to.equal('nodejs.heap.total');
      });
    });
  });
});
