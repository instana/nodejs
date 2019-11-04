/* eslint-env mocha */

'use strict';

const expect = require('chai').expect;

const headersUtil = require('../src/headers');

describe('headers util', () => {
  it('returns undefined when no headers are given', () => {
    expect(headersUtil.readHeaderKeyValuePairCaseInsensitive(null, 'key')).to.be.undefined;
  });

  it('returns undefined when no key is not a string', () => {
    expect(headersUtil.readHeaderKeyValuePairCaseInsensitive({ foo: 'bar' }, [])).to.be.undefined;
  });

  it('returns undefined when header is not present', () => {
    expect(headersUtil.readHeaderKeyValuePairCaseInsensitive({ foo: 'bar' }, 'baz')).to.be.undefined;
  });

  it('returns key and value when the header is present', () => {
    expect(headersUtil.readHeaderKeyValuePairCaseInsensitive({ foo: 'bar' }, 'foo')).to.deep.equal({
      key: 'foo',
      value: 'bar'
    });
  });

  it('returns key and value when the header is present but cased differently', () => {
    expect(headersUtil.readHeaderKeyValuePairCaseInsensitive({ fOo: 'bar' }, 'FoO')).to.deep.equal({
      key: 'fOo',
      value: 'bar'
    });
  });

  it('returns the first pair when the header is present multiple times', () => {
    expect(headersUtil.readHeaderKeyValuePairCaseInsensitive({ foO: 'bar', fOo: 'baz' }, 'FoO')).to.deep.equal({
      key: 'foO',
      value: 'bar'
    });
  });

  it('returns key and value when other headers are present', () => {
    expect(
      headersUtil.readHeaderKeyValuePairCaseInsensitive(
        {
          aaa: 'aaa',
          bbb: 'bbb',
          ccc: 'ccc',
          foo: 'bar',
          ddd: 'ddd'
        },
        'foo'
      )
    ).to.deep.equal({
      key: 'foo',
      value: 'bar'
    });
  });
});
