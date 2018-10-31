/* eslint-env mocha */

'use strict';

var urlUtils = require('../../src/util/url');
var expect = require('chai').expect;

describe('util/url', function() {
  describe('discardUrlParameters', function() {
    it('must strip query parameters', function() {
      expect(urlUtils.discardUrlParameters('https://google.com/search?foo=bar')).to.equal('https://google.com/search');
    });

    it('must strip matrix parameters', function() {
      expect(urlUtils.discardUrlParameters('https://google.com/search;foo=bar')).to.equal('https://google.com/search');
    });

    it('must keep the URL intact when no parameters exist', function() {
      expect(urlUtils.discardUrlParameters('https://google.com/search/')).to.equal('https://google.com/search/');
    });

    it('must discard of mix of various parameter types', function() {
      expect(urlUtils.discardUrlParameters('https://google.com/search/;foo=bar?query=true#blub')).to.equal(
        'https://google.com/search/'
      );
    });
  });
});
