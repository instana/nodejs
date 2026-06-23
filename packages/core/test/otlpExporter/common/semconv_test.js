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
