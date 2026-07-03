/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const deepMerge = require('../../src/util/deepMerge');

describe('util.deepMerge', () => {
  it('should merge nulls to null', () => {
    expect(deepMerge(null, null)).to.not.exist;
    expect(deepMerge(null, undefined)).to.not.exist;
    expect(deepMerge(undefined, null)).to.not.exist;
  });

  it('should merge object and null', () => {
    expect(deepMerge({ value: 13 }, null).value).to.equal(13);
    expect(deepMerge({ value: 13 }, undefined).value).to.equal(13);
    expect(deepMerge(null, { value: 13 }).value).to.equal(13);
    expect(deepMerge(undefined, { value: 13 }).value).to.equal(13);
  });

  it('should merge two objects with different properties', () => {
    const merged = deepMerge({ a: 13 }, { b: 2 });
    expect(merged.a).to.equal(13);
    expect(merged.b).to.equal(2);
  });

  it('source takes precedence in case of conflicts', () => {
    const merged = deepMerge({ a: 13 }, { a: 2 });
    expect(merged.a).to.equal(2);
  });

  it('source takes precedence in case of conflicts', () => {
    const merged = deepMerge({ a: 13 }, { a: 2 });
    expect(merged.a).to.equal(2);
  });

  it('merges recursively', () => {
    const merged = deepMerge({ nested: { a: 13 } }, { nested: { b: 2 } });
    expect(merged.nested.a).to.equal(13);
    expect(merged.nested.b).to.equal(2);
  });

  it('uses source property when target property does not exist', () => {
    const merged = deepMerge({ nested: { a: 13 } }, { nested: { b: 2, c: 1234 } });
    expect(merged.nested.c).to.equal(1234);
  });

  it('uses source property when target property is array', () => {
    const merged = deepMerge({ nested: { value: [1, 2, 3] } }, { nested: { value: { deep: 'Ohai!' } } });
    expect(merged.nested.value.deep).to.equal('Ohai!');
  });

  it('uses source property when source property is array', () => {
    const merged = deepMerge({ nested: { value: { deep: 'Ohai!' } } }, { nested: { value: [1, 2, 3] } });
    expect(merged.nested.value).to.deep.equal([1, 2, 3]);
  });

  it('uses source property when target property is not an object', () => {
    const merged = deepMerge({ nested: { value: 'not an object' } }, { nested: { value: { deep: 'Ohai!' } } });
    expect(merged.nested.value.deep).to.equal('Ohai!');
  });

  it('uses source property when source property is not an object', () => {
    const merged = deepMerge({ nested: { value: { deep: 'Ohai!' } } }, { nested: { value: 'not an object' } });
    expect(merged.nested.value).to.equal('not an object');
  });

  it('uses target property when source property is null', () => {
    const merged = deepMerge({ nested: { value: { deep: 'Ohai!' } } }, { nested: { value: null } });
    expect(merged.nested.value.deep).to.equal('Ohai!');
  });

  describe('prototype pollution prevention', () => {
    afterEach(() => {
      delete Object.prototype.polluted;
    });

    it('ignores __proto__ key and does not pollute Object.prototype', () => {
      const payload = JSON.parse('{"__proto__":{"polluted":"pwn"}}');
      deepMerge({}, payload);
      expect(Object.prototype.polluted).to.be.undefined;
      expect({}.polluted).to.be.undefined;
    });

    it('ignores _proto_ key used via JSON parse trick and does not pollute Object.prototype', () => {
      // JSON.parse turns the string key "__proto__" into the actual __proto__ accessor;
      // some environments represent it differently – guard both spellings via the source object directly.
      const source = Object.create(null);
      // eslint-disable-next-line no-proto
      source.__proto__ = { polluted: 'pwn' };
      deepMerge({}, source);
      expect(Object.prototype.polluted).to.be.undefined;
      expect({}.polluted).to.be.undefined;
    });

    it('ignores constructor key and does not pollute Object.prototype', () => {
      const source = { constructor: { prototype: { polluted: 'pwn' } } };
      deepMerge({}, source);
      expect(Object.prototype.polluted).to.be.undefined;
      expect({}.polluted).to.be.undefined;
    });

    it('ignores prototype key', () => {
      const source = { prototype: { polluted: 'pwn' } };
      const target = {};
      deepMerge(target, source);
      expect(Object.prototype.polluted).to.be.undefined;
      expect(target.prototype).to.be.undefined;
    });

    it('still merges legitimate keys alongside unsafe keys', () => {
      const payload = JSON.parse('{"__proto__":{"polluted":"pwn"},"safe":"value"}');
      const target = { existing: 1 };
      const merged = deepMerge(target, payload);
      expect(merged.existing).to.equal(1);
      expect(merged.safe).to.equal('value');
      expect(Object.prototype.polluted).to.be.undefined;
    });
  });
});
