/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const { sanitizeUrl } = require('../../src/util/url');
const expect = require('chai').expect;

describe('util/url', () => {
  describe('sanitizeUrl', () => {
    it('must return things that are not a string unchanged', () => {
      const notAString = {};
      expect(sanitizeUrl(notAString)).to.equal(notAString);
    });

    it('must strip query parameters', () => {
      expect(sanitizeUrl('https://google.com/search?foo=bar')).to.equal('https://google.com/search');
    });

    it('must not strip matrix parameters', () => {
      expect(sanitizeUrl('https://google.com/search;foo=bar')).to.equal('https://google.com/search;foo=bar');
    });

    it('must keep the URL intact when no parameters exist', () => {
      expect(sanitizeUrl('https://google.com/search/')).to.equal('https://google.com/search/');
    });

    it('must discard of mix of various parameter types', () => {
      expect(sanitizeUrl('https://google.com/search/;foo=bar?query=true#blub')).to.equal(
        'https://google.com/search/;foo=bar'
      );
    });

    it('must redact embedded credentials', () => {
      expect(sanitizeUrl('http://user:password@example.org/route')).to.equal(
        'http://<redacted>:<redacted>@example.org/route'
      );
    });

    it('must redact embedded credentials and remove params', () => {
      expect(sanitizeUrl('http://user:password@example.org/route;matrix=value?query=true#anchor')).to.equal(
        'http://<redacted>:<redacted>@example.org/route;matrix=value'
      );
    });

    it('must not mistakenly interprete query params with @ as credentials', () => {
      expect(sanitizeUrl('http://example.org/route?param=email@domain.tld')).to.equal('http://example.org/route');
    });

    it('must not mistakenly interprete # matrix params with : and @ as credentials', () => {
      expect(sanitizeUrl('http://example.org#colon=:;param=email@domain.tld')).to.equal('http://example.org/');
    });

    it('must not mistakenly interprete paths with : and @ as credentials', () => {
      expect(sanitizeUrl('http://example.org/colon:/param=email@domain.tld')).to.equal(
        'http://example.org/colon:/param=email@domain.tld'
      );
    });
    it('must keep URL with matrix parameters and query string', () => {
      expect(sanitizeUrl('http://example.org/ACDKey=1:00000:00000;ANI=00000111;DN=00000111')).to.equal(
        'http://example.org/ACDKey=1:00000:00000;ANI=00000111;DN=00000111'
      );
    });
  });
});
