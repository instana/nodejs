'use strict';

const urlUtils = require('../../src/util/url');
const expect = require('chai').expect;

describe('util/url', () => {
  describe('discardUrlParameters', () => {
    it('must strip query parameters', () => {
      expect(urlUtils.discardUrlParameters('https://google.com/search?foo=bar')).to.equal('https://google.com/search');
    });

    it('must strip matrix parameters', () => {
      expect(urlUtils.discardUrlParameters('https://google.com/search;foo=bar')).to.equal('https://google.com/search');
    });

    it('must keep the URL intact when no parameters exist', () => {
      expect(urlUtils.discardUrlParameters('https://google.com/search/')).to.equal('https://google.com/search/');
    });

    it('must discard of mix of various parameter types', () => {
      expect(urlUtils.discardUrlParameters('https://google.com/search/;foo=bar?query=true#blub')).to.equal(
        'https://google.com/search/'
      );
    });
  });
});
