/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;

var deepMerge = require('../../src/util/deepMerge');

describe('util.deepMerge', function() {
  it('should merge nulls to null', function() {
    expect(deepMerge(null, null)).to.not.exist;
    expect(deepMerge(null, undefined)).to.not.exist;
    expect(deepMerge(undefined, null)).to.not.exist;
  });

  it('should merge object and null', function() {
    expect(deepMerge({ value: 13 }, null).value).to.equal(13);
    expect(deepMerge({ value: 13 }, undefined).value).to.equal(13);
    expect(deepMerge(null, { value: 13 }).value).to.equal(13);
    expect(deepMerge(undefined, { value: 13 }).value).to.equal(13);
  });

  it('should merge two objects with different properties', function() {
    var merged = deepMerge({ a: 13 }, { b: 2 });
    expect(merged.a).to.equal(13);
    expect(merged.b).to.equal(2);
  });

  it('source takes precedence in case of conflicts', function() {
    var merged = deepMerge({ a: 13 }, { a: 2 });
    expect(merged.a).to.equal(2);
  });

  it('source takes precedence in case of conflicts', function() {
    var merged = deepMerge({ a: 13 }, { a: 2 });
    expect(merged.a).to.equal(2);
  });

  it('merges recursively', function() {
    var merged = deepMerge({ nested: { a: 13 } }, { nested: { b: 2 } });
    expect(merged.nested.a).to.equal(13);
    expect(merged.nested.b).to.equal(2);
  });

  it('uses source property when target property does not exist', function() {
    var merged = deepMerge({ nested: { a: 13 } }, { nested: { b: 2, c: 1234 } });
    expect(merged.nested.c).to.equal(1234);
  });

  it('uses source property when target property is array', function() {
    var merged = deepMerge({ nested: { value: [1, 2, 3] } }, { nested: { value: { deep: 'Ohai!' } } });
    expect(merged.nested.value.deep).to.equal('Ohai!');
  });

  it('uses source property when source property is array', function() {
    var merged = deepMerge({ nested: { value: { deep: 'Ohai!' } } }, { nested: { value: [1, 2, 3] } });
    expect(merged.nested.value).to.deep.equal([1, 2, 3]);
  });

  it('uses source property when target property is not an object', function() {
    var merged = deepMerge({ nested: { value: 'not an object' } }, { nested: { value: { deep: 'Ohai!' } } });
    expect(merged.nested.value.deep).to.equal('Ohai!');
  });

  it('uses source property when source property is not an object', function() {
    var merged = deepMerge({ nested: { value: { deep: 'Ohai!' } } }, { nested: { value: 'not an object' } });
    expect(merged.nested.value).to.equal('not an object');
  });

  it('uses target property when source property is null', function() {
    var merged = deepMerge({ nested: { value: { deep: 'Ohai!' } } }, { nested: { value: null } });
    expect(merged.nested.value.deep).to.equal('Ohai!');
  });
});
