/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var tracingUtil = require('../../src/tracing/tracingUtil');

describe('tracing/tracingUtil', function() {
  describe('generateRandomSpanId', function() {
    it('must generate random IDs', function() {
      for (var i = 0; i < 30; i++) {
        expect(tracingUtil.generateRandomSpanId()).to.be.a('string');
      }
    });
  });

  describe('getErrorDetails', function() {
    it('must not fail on null/undefined', function() {
      expect(tracingUtil.getErrorDetails(null)).to.equal(undefined);
      expect(tracingUtil.getErrorDetails(undefined)).to.equal(undefined);
    });

    it('must use error stack when available', function() {
      expect(tracingUtil.getErrorDetails(new Error('Whhoooopppppss'))).to.match(/Whhoooopppppss/);
    });

    it('must use error message when available', function() {
      expect(tracingUtil.getErrorDetails({ message: 'Whhoooopppppss' })).to.match(/Whhoooopppppss/);
    });

    it('must use the whole provided error when all else fails', function() {
      expect(tracingUtil.getErrorDetails('Whhoooopppppss')).to.match(/Whhoooopppppss/);
    });
  });
});
