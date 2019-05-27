/* eslint-env mocha */

'use strict';

const expect = require('chai').expect;
const compression = require('../../src/util/compression');

describe('compression', () => {
  it('should comparse primitive values', () => {
    expect(compression(42, 43)).to.deep.equal(43);
    expect(compression(true, false)).to.deep.equal(false);
  });

  it('should copy new value if type changes', () => {
    expect(compression(42, true)).to.deep.equal(true);
    expect(compression(42, 'foobar')).to.deep.equal('foobar');
  });

  describe('objects', () => {
    it('should find new properties', () => {
      expect(compression({}, { a: 42 })).to.deep.equal({ a: 42 });
    });

    it('should ignore unchanged properties', () => {
      expect(compression({ a: 42 }, { a: 42 })).to.deep.equal({});
    });

    it('should deep find new properties', () => {
      expect(compression({}, { a: { b: 7 } })).to.deep.equal({ a: { b: 7 } });
    });

    it('should ignore unchanged properties', () => {
      expect(compression({ a: { b: 7 } }, { a: { b: 7, c: 3 } })).to.deep.equal({ a: { c: 3 } });
    });

    it('should mark all values as new', () => {
      expect(compression(undefined, { a: { b: 7, c: 3 } })).to.deep.equal({ a: { b: 7, c: 3 } });
    });
  });

  describe('arrays', () => {
    it('should report empty next array as empty arrays', () => {
      expect(compression({ data: [1, 2] }, { data: [] })).to.deep.equal({ data: [] });
    });

    it('should report complete new array when the length differs', () => {
      expect(compression({ data: [1, 2] }, { data: [1, 2, 3] })).to.deep.equal({ data: [1, 2, 3] });
      expect(compression({ data: [1, 2, 3] }, { data: [1, 2] })).to.deep.equal({ data: [1, 2] });
    });

    it('should report undefined when array is shallow unchanged', () => {
      expect(compression({ data: [1, 2, 3] }, { data: [1, 2, 3] })).to.deep.equal({});
      expect(compression({ data: [1] }, { data: [1] })).to.deep.equal({});
      expect(compression({ data: [] }, { data: [] })).to.deep.equal({});
    });

    it('should resend the whole array when any of the values changes', () => {
      expect(compression({ data: [1, 2, 3] }, { data: [1, 2, 4] })).to.deep.equal({ data: [1, 2, 4] });
    });
  });
});
