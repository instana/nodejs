/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var tracingUtil = require('./tracingUtil');

describe('tracing/tracingUtil', function() {
  describe('generateRandomSpanId', function() {
    it('must generate random IDs', function() {
      for (var i = 0; i < 30; i++) {
        expect(tracingUtil.generateRandomSpanId()).to.be.a('string');
      }
    });
  });
});
