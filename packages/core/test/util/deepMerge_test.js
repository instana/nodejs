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
});
