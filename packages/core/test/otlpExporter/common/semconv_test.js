/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { merge } = require('../../../src/otlpExporter/common/semconv/merge');

describe('otlpExporter/common/semconv', () => {
  describe('merge function', () => {
    describe('basic merging', () => {
      it('should merge two simple objects without conflicts', () => {
        const base = { a: 1, b: 2 };
        const overrides = { c: 3 };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1, b: 2, c: 3 });
      });

      it('should override base property values when conflicts exist', () => {
        const base = { a: 1, b: 2 };
        const overrides = { b: 99 };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1, b: 99 });
      });

      it('should correctly apply multiple property overrides simultaneously', () => {
        const base = { a: 1, b: 2, c: 3 };
        const overrides = { b: 20, c: 30 };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1, b: 20, c: 30 });
      });
    });

    describe('Nested object merging', () => {
      it('should recursively merge nested objects while preserving structure', () => {
        const base = {
          level1: {
            a: 1,
            b: 2
          }
        };
        const overrides = {
          level1: {
            c: 3
          }
        };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({
          level1: {
            a: 1,
            b: 2,
            c: 3
          }
        });
      });

      it('should override values within nested objects correctly', () => {
        const base = {
          level1: {
            a: 1,
            b: 2
          }
        };
        const overrides = {
          level1: {
            b: 99
          }
        };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({
          level1: {
            a: 1,
            b: 99
          }
        });
      });

      it('should handle deeply nested object hierarchies (3+ levels)', () => {
        const base = {
          level1: {
            level2: {
              level3: {
                a: 1
              }
            }
          }
        };
        const overrides = {
          level1: {
            level2: {
              level3: {
                b: 2
              }
            }
          }
        };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({
          level1: {
            level2: {
              level3: {
                a: 1,
                b: 2
              }
            }
          }
        });
      });

      it('should merge multiple nested object branches simultaneously', () => {
        const base = {
          http: { method: 'GET', status: 200 },
          db: { system: 'postgresql' }
        };
        const overrides = {
          http: { url: '/api/users' },
          messaging: { system: 'kafka' }
        };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({
          http: { method: 'GET', status: 200, url: '/api/users' },
          db: { system: 'postgresql' },
          messaging: { system: 'kafka' }
        });
      });
    });

    describe('Array handling', () => {
      it('should replace arrays completely instead of merging elements', () => {
        const base = { arr: [1, 2, 3] };
        const overrides = { arr: [4, 5] };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ arr: [4, 5] });
      });

      it('should replace arrays within nested object structures', () => {
        const base = {
          data: {
            items: [1, 2, 3]
          }
        };
        const overrides = {
          data: {
            items: [4, 5]
          }
        };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({
          data: {
            items: [4, 5]
          }
        });
      });

      describe('getLookupConfig', () => {
        const { getLookupConfig } = require('../../../src/otlpExporter/common/semconv');

        describe('version switching', () => {
          it('should return version 1.23 configuration when no version is specified', () => {
            const config = getLookupConfig();

            expect(config).to.be.an('object');
            expect(config).to.have.property('http');
            expect(config).to.have.property('metadata');
            expect(config).to.have.property('resource');
          });

          it('should return version 1.23 configuration when explicitly requested', () => {
            const config = getLookupConfig('1.23');

            expect(config).to.be.an('object');
            expect(config).to.have.property('http');
            expect(config).to.have.property('metadata');
            expect(config).to.have.property('resource');
          });

          it('should return version 1.41 configuration when explicitly requested', () => {
            const config = getLookupConfig('1.41');

            expect(config).to.be.an('object');
            expect(config).to.have.property('http');
            expect(config).to.have.property('metadata');
            expect(config).to.have.property('resource');
          });

          it('should throw error for unknown semantic convention version', () => {
            expect(() => getLookupConfig('2.0')).to.throw('Unknown semantic convention version: 2.0');
          });

          it('should throw error for invalid version format', () => {
            expect(() => getLookupConfig('invalid')).to.throw('Unknown semantic convention version: invalid');
          });

          it('should return different configurations for different versions', () => {
            const config123 = getLookupConfig('1.23');
            const config141 = getLookupConfig('1.41');

            // Configurations should be different objects
            expect(config123).to.not.equal(config141);
          });

          it('should have consistent metadata structure across versions', () => {
            const config123 = getLookupConfig('1.23');
            const config141 = getLookupConfig('1.41');

            // Both should have metadata with core fields
            expect(config123.metadata).to.have.property('TRACE_ID');
            expect(config123.metadata).to.have.property('SPAN_ID');
            expect(config123.metadata).to.have.property('PARENT_ID');

            expect(config141.metadata).to.have.property('TRACE_ID');
            expect(config141.metadata).to.have.property('SPAN_ID');
            expect(config141.metadata).to.have.property('PARENT_ID');
          });

          it('should have consistent resource structure across versions', () => {
            const config123 = getLookupConfig('1.23');
            const config141 = getLookupConfig('1.41');

            expect(config123.resource).to.have.property('SERVICE_NAME');
            expect(config123.resource).to.have.property('SDK_LANGUAGE');
            expect(config123.resource).to.have.property('SDK_NAME');

            expect(config141.resource).to.have.property('SERVICE_NAME');
            expect(config141.resource).to.have.property('SDK_LANGUAGE');
            expect(config141.resource).to.have.property('SDK_NAME');
          });

          it('should return frozen/immutable configuration objects', () => {
            const config123 = getLookupConfig('1.23');
            const config141 = getLookupConfig('1.41');

            expect(Object.isFrozen(config123)).to.be.true;
            expect(Object.isFrozen(config141)).to.be.true;
          });

          it('should cache and return same instance for repeated calls with same version', () => {
            const config1 = getLookupConfig('1.23');
            const config2 = getLookupConfig('1.23');

            expect(config1).to.equal(config2);
          });

          it('should have http semantic conventions in both versions', () => {
            const config123 = getLookupConfig('1.23');
            const config141 = getLookupConfig('1.41');

            expect(config123.http).to.be.an('object');
            expect(config141.http).to.be.an('object');

            expect(config123.http).to.have.property('REQUEST_METHOD');
            expect(config141.http).to.have.property('REQUEST_METHOD');
          });

          it('should have database semantic conventions in both versions', () => {
            const config123 = getLookupConfig('1.23');
            const config141 = getLookupConfig('1.41');

            expect(config123.database).to.be.an('object');
            expect(config141.database).to.be.an('object');

            expect(config123.database).to.have.property('SYSTEM_NAME');
            expect(config141.database).to.have.property('SYSTEM_NAME');
          });

          it('should have messaging semantic conventions in both versions', () => {
            const config123 = getLookupConfig('1.23');
            const config141 = getLookupConfig('1.41');

            expect(config123.messaging).to.be.an('object');
            expect(config141.messaging).to.be.an('object');

            expect(config123.messaging).to.have.property('SYSTEM');
            expect(config141.messaging).to.have.property('SYSTEM');
          });

          it('should handle version as string with proper type checking', () => {
            const config = getLookupConfig('1.23');
            expect(config).to.be.an('object');

            expect(() => getLookupConfig('1.41')).to.not.throw();
          });

          it('should maintain attribute naming consistency for metadata fields', () => {
            const config123 = getLookupConfig('1.23');
            const config141 = getLookupConfig('1.41');

            expect(config123.metadata.TRACE_ID).to.equal('traceId');
            expect(config141.metadata.TRACE_ID).to.equal('traceId');

            expect(config123.metadata.SPAN_ID).to.equal('spanId');
            expect(config141.metadata.SPAN_ID).to.equal('spanId');

            expect(config123.metadata.PARENT_ID).to.equal('parentSpanId');
            expect(config141.metadata.PARENT_ID).to.equal('parentSpanId');
          });

          it('should support switching between versions multiple times', () => {
            const config123First = getLookupConfig('1.23');
            const config141First = getLookupConfig('1.41');
            const config123Second = getLookupConfig('1.23');
            const config141Second = getLookupConfig('1.41');
            expect(config123First).to.equal(config123Second);
            expect(config141First).to.equal(config141Second);

            expect(config123First).to.not.equal(config141First);
          });
        });
      });
    });

    describe('Edge cases and boundary conditions', () => {
      it('should return a frozen copy of base when overrides is null', () => {
        const base = { a: 1, b: 2 };
        const result = merge(base, null);

        expect(result).to.deep.equal({ a: 1, b: 2 });
        expect(Object.isFrozen(result)).to.be.true;
      });

      it('should return a frozen copy of base when overrides is undefined', () => {
        const base = { a: 1, b: 2 };
        const result = merge(base, undefined);

        expect(result).to.deep.equal({ a: 1, b: 2 });
        expect(Object.isFrozen(result)).to.be.true;
      });

      it('should return a frozen copy of base when overrides is an empty object', () => {
        const base = { a: 1, b: 2 };
        const result = merge(base, {});

        expect(result).to.deep.equal({ a: 1, b: 2 });
        expect(Object.isFrozen(result)).to.be.true;
      });

      it('should successfully merge when base object is empty', () => {
        const base = {};
        const overrides = { a: 1 };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1 });
      });

      it('should correctly handle null values in override properties', () => {
        const base = { a: 1, b: 2 };
        const overrides = { b: null };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1, b: null });
      });

      it('should correctly handle undefined values in override properties', () => {
        const base = { a: 1, b: 2 };
        const overrides = { b: undefined };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1, b: undefined });
      });

      it('should correctly merge boolean values', () => {
        const base = { flag: false };
        const overrides = { flag: true };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ flag: true });
      });

      it('should correctly handle numeric values including zero', () => {
        const base = { count: 10 };
        const overrides = { count: 0 };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ count: 0 });
      });

      it('should correctly handle string values including empty strings', () => {
        const base = { name: 'test' };
        const overrides = { name: '' };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ name: '' });
      });
    });

    describe('Immutability guarantees', () => {
      it('should return a deeply frozen immutable object', () => {
        const base = { a: 1 };
        const overrides = { b: 2 };
        const result = merge(base, overrides);

        expect(Object.isFrozen(result)).to.be.true;
      });

      it('should not mutate the original base object', () => {
        const base = { a: 1, b: 2 };
        const baseCopy = { ...base };
        const overrides = { c: 3 };

        merge(base, overrides);

        expect(base).to.deep.equal(baseCopy);
      });

      it('should not mutate the original overrides object', () => {
        const base = { a: 1 };
        const overrides = { b: 2 };
        const overridesCopy = { ...overrides };

        merge(base, overrides);

        expect(overrides).to.deep.equal(overridesCopy);
      });

      it('should recursively freeze all nested objects', () => {
        const base = { nested: { a: 1 } };
        const overrides = { nested: { b: 2 } };
        const result = merge(base, overrides);

        expect(Object.isFrozen(result.nested)).to.be.true;
      });

      it('should throw error when attempting to modify the returned object', () => {
        const base = { a: 1 };
        const overrides = { b: 2 };
        const result = merge(base, overrides);

        expect(() => {
          result.c = 3;
        }).to.throw();
      });
    });

    describe('Complex real-world scenarios', () => {
      it('should merge OpenTelemetry semantic convention attribute mappings', () => {
        const base = {
          http: {
            method: 'http.method',
            status_code: 'http.status_code',
            url: 'http.url'
          },
          db: {
            system: 'db.system',
            statement: 'db.statement'
          }
        };

        const overrides = {
          http: {
            route: 'http.route',
            status_code: 'http.response.status_code' // Override for newer version
          },
          messaging: {
            system: 'messaging.system'
          }
        };

        const result = merge(base, overrides);

        expect(result).to.deep.equal({
          http: {
            method: 'http.method',
            status_code: 'http.response.status_code',
            url: 'http.url',
            route: 'http.route'
          },
          db: {
            system: 'db.system',
            statement: 'db.statement'
          },
          messaging: {
            system: 'messaging.system'
          }
        });
      });

      it('should handle configuration objects with mixed data types', () => {
        const base = {
          config: {
            enabled: true,
            timeout: 5000,
            endpoints: ['http://localhost:8080']
          }
        };

        const overrides = {
          config: {
            timeout: 10000,
            retries: 3
          }
        };

        const result = merge(base, overrides);

        expect(result).to.deep.equal({
          config: {
            enabled: true,
            timeout: 10000,
            endpoints: ['http://localhost:8080'],
            retries: 3
          }
        });
      });
    });

    describe('Type preservation', () => {
      it('should preserve string data types during merge', () => {
        const base = { str: 'hello' };
        const overrides = { str: 'world' };
        const result = merge(base, overrides);

        expect(result.str).to.be.a('string');
        expect(result.str).to.equal('world');
      });

      it('should preserve number data types during merge', () => {
        const base = { num: 42 };
        const overrides = { num: 100 };
        const result = merge(base, overrides);

        expect(result.num).to.be.a('number');
        expect(result.num).to.equal(100);
      });

      it('should preserve boolean data types during merge', () => {
        const base = { bool: false };
        const overrides = { bool: true };
        const result = merge(base, overrides);

        expect(result.bool).to.be.a('boolean');
        expect(result.bool).to.equal(true);
      });

      it('should preserve array data types during merge', () => {
        const base = { arr: [1, 2] };
        const overrides = { arr: [3, 4] };
        const result = merge(base, overrides);

        expect(result.arr).to.be.an('array');
        expect(result.arr).to.deep.equal([3, 4]);
      });
    });
  });
});
