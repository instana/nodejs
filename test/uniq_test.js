/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var uniq = require('../src/uniq');

describe('uniq', function() {
  it('should not fail for empty arrays', function() {
    expect(uniq([])).to.deep.equal([]);
  });

  it('should not fail for arrays of length 1', function() {
    expect(uniq([2])).to.deep.equal([2]);
  });

  it('should remove duplicates', function() {
    expect(uniq([1, 1, 2, 3, 3, 4])).to.deep.equal([1, 2, 3, 4]);
  });

  it('should remove duplicates in unsorted inputs', function() {
    expect(uniq([4, 2, 1, 3, 2, 4])).to.deep.equal([1, 2, 3, 4]);
  });
});
