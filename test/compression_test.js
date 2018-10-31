/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var compression = require('../src/compression');

describe('compression', function() {
  it('should comparse primitive values', function() {
    expect(compression(42, 43)).to.deep.equal(43);
    expect(compression(true, false)).to.deep.equal(false);
  });

  it('should copy new value if type changes', function() {
    expect(compression(42, true)).to.deep.equal(true);
    expect(compression(42, 'foobar')).to.deep.equal('foobar');
  });

  describe('objects', function() {
    it('should find new properties', function() {
      expect(compression({}, { a: 42 })).to.deep.equal({ a: 42 });
    });

    it('should ignore unchanged properties', function() {
      expect(compression({ a: 42 }, { a: 42 })).to.deep.equal({});
    });

    it('should deep find new properties', function() {
      expect(compression({}, { a: { b: 7 } })).to.deep.equal({ a: { b: 7 } });
    });

    it('should ignore unchanged properties', function() {
      expect(compression({ a: { b: 7 } }, { a: { b: 7, c: 3 } })).to.deep.equal({ a: { c: 3 } });
    });

    it('should mark all values as new', function() {
      expect(compression(undefined, { a: { b: 7, c: 3 } })).to.deep.equal({ a: { b: 7, c: 3 } });
    });
  });

  describe('arrays', function() {
    it('should report empty next array as empty arrays', function() {
      expect(compression({ data: [1, 2] }, { data: [] })).to.deep.equal({ data: [] });
    });

    it('should report complete new array when the length differs', function() {
      expect(compression({ data: [1, 2] }, { data: [1, 2, 3] })).to.deep.equal({ data: [1, 2, 3] });
      expect(compression({ data: [1, 2, 3] }, { data: [1, 2] })).to.deep.equal({ data: [1, 2] });
    });

    it('should report undefined when array is shallow unchanged', function() {
      expect(compression({ data: [1, 2, 3] }, { data: [1, 2, 3] })).to.deep.equal({});
      expect(compression({ data: [1] }, { data: [1] })).to.deep.equal({});
      expect(compression({ data: [] }, { data: [] })).to.deep.equal({});
    });

    it('should resend the whole array when any of the values changes', function() {
      expect(compression({ data: [1, 2, 3] }, { data: [1, 2, 4] })).to.deep.equal({ data: [1, 2, 4] });
    });
  });
});
