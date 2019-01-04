/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var fail = require('assert').fail;

var tracingUtil = require('../../src/tracing/tracingUtil');

describe('tracing/tracingUtil', function() {
  describe('generate random IDs', function() {
    this.timeout(60000);

    testRandomIds('trace', tracingUtil.generateRandomTraceId, 16);
    testRandomIds('span', tracingUtil.generateRandomSpanId, 16);

    function testRandomIds(idType, genFn, expectedLength) {
      it('must generate random ' + idType + ' IDs', function() {
        var iterations = 20000;
        var generatedIds = [];
        for (var i = 0; i < iterations; i++) {
          generatedIds[i] = genFn();
          expect(generatedIds[i]).to.be.a('string');
          expect(generatedIds[i].length).to.equal(expectedLength);
        }

        // verify that the generated IDs are unique
        for (i = 0; i < iterations; i++) {
          for (var j = 0; j < iterations; j++) {
            // eslint-disable-next-line no-continue
            if (i === j) continue;
            // eslint-disable-next-line eqeqeq
            if (generatedIds[i] == generatedIds[j]) {
              fail(
                // actual
                generatedIds[j],
                // expected
                'an ID != ' + generatedIds[j],
                // message
                'found a non-unique ID at indices ' +
                  i +
                  ' and ' +
                  j +
                  ': ' +
                  generatedIds[i] +
                  ' === ' +
                  generatedIds[j]
              );
            }
          }
        }
      });
    }
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
