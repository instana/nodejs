/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2015
 */

'use strict';

const expect = require('chai').expect;
const uniq = require('../../src/util/uniq');

describe('uniq', () => {
  it('should not fail for empty arrays', () => {
    expect(uniq([])).to.deep.equal([]);
  });

  it('should not fail for arrays of length 1', () => {
    expect(uniq([2])).to.deep.equal([2]);
  });

  it('should remove duplicates', () => {
    expect(uniq([1, 1, 2, 3, 3, 4])).to.deep.equal([1, 2, 3, 4]);
  });

  it('should remove duplicates in unsorted inputs', () => {
    expect(uniq([4, 2, 1, 3, 2, 4])).to.deep.equal([1, 2, 3, 4]);
  });
});
