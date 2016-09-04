/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;

var tracing = require('./index');

describe('tracing', function() {
  describe('supportsAsyncWrap', function() {
    it('must support various Node.js versions', function() {
      expect(tracing.supportsAsyncWrap('4.5.0')).to.equal(true);
      expect(tracing.supportsAsyncWrap('4.5.1')).to.equal(true);
      expect(tracing.supportsAsyncWrap('4.6.0')).to.equal(true);
      expect(tracing.supportsAsyncWrap('4.14.0')).to.equal(true);

      expect(tracing.supportsAsyncWrap('5.10.0')).to.equal(true);
      expect(tracing.supportsAsyncWrap('5.11.0')).to.equal(true);

      expect(tracing.supportsAsyncWrap('6.0.0')).to.equal(true);
      expect(tracing.supportsAsyncWrap('6.1.0')).to.equal(true);
      expect(tracing.supportsAsyncWrap('6.1.0-alpha')).to.equal(true);
      expect(tracing.supportsAsyncWrap('6.2.0')).to.equal(true);
    });

    it('must report various Node.js versions as not supported', function() {
      expect(tracing.supportsAsyncWrap('1.15.0')).to.equal(false);
      expect(tracing.supportsAsyncWrap('2.15.0')).to.equal(false);
      expect(tracing.supportsAsyncWrap('3.15.0')).to.equal(false);

      expect(tracing.supportsAsyncWrap('4.4.9')).to.equal(false);
      expect(tracing.supportsAsyncWrap('4.0.0')).to.equal(false);

      expect(tracing.supportsAsyncWrap('5.9.0')).to.equal(false);
    });
  });
});
