/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { merge } = require('../../../../src/otlpExporter/common/semconv/merge');

describe('otlpExporter/common/semconv/merge', () => {
  describe('merge function', () => {
    describe('basic merging', () => {
      it('should merge two simple objects', () => {
        const base = { a: 1, b: 2 };
        const overrides = { c: 3 };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1, b: 2, c: 3 });
      });

      it('should override base values with override values', () => {
        const base = { a: 1, b: 2 };
        const overrides = { b: 99 };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1, b: 99 });
      });

      it('should handle multiple overrides', () => {
        const base = { a: 1, b: 2, c: 3 };
        const overrides = { b: 20, c: 30 };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1, b: 20, c: 30 });
      });
    });

    describe('nested object merging', () => {
      it('should recursively merge nested objects', () => {
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

      it('should override nested values', () => {
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

      it('should handle deeply nested objects', () => {
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

      it('should merge multiple nested levels', () => {
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

    describe('array handling', () => {
      it('should replace arrays instead of merging them', () => {
        const base = { arr: [1, 2, 3] };
        const overrides = { arr: [4, 5] };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ arr: [4, 5] });
      });

      it('should handle arrays in nested objects', () => {
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

    describe('edge cases', () => {
      it('should return frozen copy of base when overrides is null', () => {
        const base = { a: 1, b: 2 };
        const result = merge(base, null);

        expect(result).to.deep.equal({ a: 1, b: 2 });
        expect(Object.isFrozen(result)).to.be.true;
      });

      it('should return frozen copy of base when overrides is undefined', () => {
        const base = { a: 1, b: 2 };
        const result = merge(base, undefined);

        expect(result).to.deep.equal({ a: 1, b: 2 });
        expect(Object.isFrozen(result)).to.be.true;
      });

      it('should return frozen copy of base when overrides is empty object', () => {
        const base = { a: 1, b: 2 };
        const result = merge(base, {});

        expect(result).to.deep.equal({ a: 1, b: 2 });
        expect(Object.isFrozen(result)).to.be.true;
      });

      it('should handle empty base object', () => {
        const base = {};
        const overrides = { a: 1 };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1 });
      });

      it('should handle null values in overrides', () => {
        const base = { a: 1, b: 2 };
        const overrides = { b: null };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1, b: null });
      });

      it('should handle undefined values in overrides', () => {
        const base = { a: 1, b: 2 };
        const overrides = { b: undefined };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ a: 1, b: undefined });
      });

      it('should handle boolean values', () => {
        const base = { flag: false };
        const overrides = { flag: true };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ flag: true });
      });

      it('should handle number values including zero', () => {
        const base = { count: 10 };
        const overrides = { count: 0 };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ count: 0 });
      });

      it('should handle string values including empty strings', () => {
        const base = { name: 'test' };
        const overrides = { name: '' };
        const result = merge(base, overrides);

        expect(result).to.deep.equal({ name: '' });
      });
    });

    describe('immutability', () => {
      it('should return a frozen object', () => {
        const base = { a: 1 };
        const overrides = { b: 2 };
        const result = merge(base, overrides);

        expect(Object.isFrozen(result)).to.be.true;
      });

      it('should not modify the base object', () => {
        const base = { a: 1, b: 2 };
        const baseCopy = { ...base };
        const overrides = { c: 3 };

        merge(base, overrides);

        expect(base).to.deep.equal(baseCopy);
      });

      it('should not modify the overrides object', () => {
        const base = { a: 1 };
        const overrides = { b: 2 };
        const overridesCopy = { ...overrides };

        merge(base, overrides);

        expect(overrides).to.deep.equal(overridesCopy);
      });

      it('should freeze nested objects', () => {
        const base = { nested: { a: 1 } };
        const overrides = { nested: { b: 2 } };
        const result = merge(base, overrides);

        expect(Object.isFrozen(result.nested)).to.be.true;
      });

      it('should prevent modification of returned object', () => {
        const base = { a: 1 };
        const overrides = { b: 2 };
        const result = merge(base, overrides);

        expect(() => {
          result.c = 3;
        }).to.throw();
      });
    });

    describe('complex real-world scenarios', () => {
      it('should merge semantic convention mappings', () => {
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

      it('should handle mixed data types in nested structures', () => {
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

    describe('type preservation', () => {
      it('should preserve string types', () => {
        const base = { str: 'hello' };
        const overrides = { str: 'world' };
        const result = merge(base, overrides);

        expect(result.str).to.be.a('string');
        expect(result.str).to.equal('world');
      });

      it('should preserve number types', () => {
        const base = { num: 42 };
        const overrides = { num: 100 };
        const result = merge(base, overrides);

        expect(result.num).to.be.a('number');
        expect(result.num).to.equal(100);
      });

      it('should preserve boolean types', () => {
        const base = { bool: false };
        const overrides = { bool: true };
        const result = merge(base, overrides);

        expect(result.bool).to.be.a('boolean');
        expect(result.bool).to.equal(true);
      });

      it('should preserve array types', () => {
        const base = { arr: [1, 2] };
        const overrides = { arr: [3, 4] };
        const result = merge(base, overrides);

        expect(result.arr).to.be.an('array');
        expect(result.arr).to.deep.equal([3, 4]);
      });
    });
  });
});
