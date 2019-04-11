/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var fail = require('assert').fail;

var config = require('../config');

var tracingUtil = require('../../src/tracing/tracingUtil');

describe('tracing/tracingUtil', function() {
  describe('generate random IDs', function() {
    this.timeout(config.getTestTimeout() * 10);

    testRandomIds('trace', tracingUtil.generateRandomTraceId, 16);
    testRandomIds('span', tracingUtil.generateRandomSpanId, 16);

    // The following line checks that 128 bit (32 char)  IDs are generated okay, although we do not yet need
    // 128 bit IDs (yet). It can be removed once trace IDs are upped to 128 bit.
    testRandomIds('128 bit', tracingUtil.generateRandomId.bind(null, 32), 32);

    var validIdRegex = /^[a-f0-9]+$/;

    function testRandomIds(idType, genFn, expectedLength) {
      it('must generate unique and wellformed ' + idType + ' IDs', function() {
        var iterations = 20000;
        var generatedIds = [];
        for (var i = 0; i < iterations; i++) {
          generatedIds[i] = genFn();
          expect(generatedIds[i]).to.be.a('string');
          expect(generatedIds[i].length).to.equal(expectedLength);
          expect(generatedIds[i]).to.match(validIdRegex);
        }

        // verify that the generated IDs are unique
        for (i = 0; i < iterations; i++) {
          for (var j = i + 1; j < iterations; j++) {
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

  describe('benchmark ID generation', function() {
    this.timeout(config.getTestTimeout() * 4);

    // generate one million IDs each (64 bit/16 chars, 128 bit/32 chars)
    var iterations = 1000000;
    var maxAcceptableDuration = process.env.CI ? 50000 : 10000;

    microBenchmark(16);
    microBenchmark(32);

    function microBenchmark(length) {
      it('with hex IDs that are ' + length + ' characters long', function() {
        var start = Date.now();
        for (var i = 0; i < iterations; i++) {
          tracingUtil.generateRandomSpanId(length);
        }
        var duration = Date.now() - start;
        expect(duration).to.be.lte(maxAcceptableDuration);
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
