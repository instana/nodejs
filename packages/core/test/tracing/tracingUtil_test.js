/* eslint-env mocha */

'use strict';

const expect = require('chai').expect;
const fail = require('assert').fail;

const config = require('../config');

const tracingUtil = require('../../src/tracing/tracingUtil');

describe('tracing/tracingUtil', () => {
  describe('generate random IDs', function() {
    this.timeout(config.getTestTimeout() * 10);

    testRandomIds('trace', tracingUtil.generateRandomTraceId, 16);
    testRandomIds('span', tracingUtil.generateRandomSpanId, 16);

    // The following line checks that 128 bit (32 char)  IDs are generated okay, although we do not yet need
    // 128 bit IDs (yet). It can be removed once trace IDs are upped to 128 bit.
    testRandomIds('128 bit', tracingUtil.generateRandomId.bind(null, 32), 32);

    const validIdRegex = /^[a-f0-9]+$/;

    function testRandomIds(idType, genFn, expectedLength) {
      it(`must generate unique and wellformed ${idType} IDs`, () => {
        const iterations = 20000;
        const generatedIds = [];
        for (let i = 0; i < iterations; i++) {
          generatedIds[i] = genFn();
          expect(generatedIds[i]).to.be.a('string');
          expect(generatedIds[i].length).to.equal(expectedLength);
          expect(generatedIds[i]).to.match(validIdRegex);
        }

        // verify that the generated IDs are unique
        for (let i = 0; i < iterations; i++) {
          for (let j = i + 1; j < iterations; j++) {
            // eslint-disable-next-line eqeqeq
            if (generatedIds[i] == generatedIds[j]) {
              fail(
                // actual
                generatedIds[j],
                // expected
                `an ID != ${generatedIds[j]}`,
                // message
                `found a non-unique ID at indices ${i} and ${j}: ${generatedIds[i]} === ${generatedIds[j]}`
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
    const iterations = 1000000;
    const maxAcceptableDuration = process.env.CI ? 50000 : 10000;

    microBenchmark(16);
    microBenchmark(32);

    function microBenchmark(length) {
      it(`with hex IDs that are ${length} characters long`, () => {
        const start = Date.now();
        for (let i = 0; i < iterations; i++) {
          tracingUtil.generateRandomSpanId(length);
        }
        const duration = Date.now() - start;
        expect(duration).to.be.lte(maxAcceptableDuration);
      });
    }
  });

  describe('getErrorDetails', () => {
    it('must not fail on null/undefined', () => {
      expect(tracingUtil.getErrorDetails(null)).to.equal(undefined);
      expect(tracingUtil.getErrorDetails(undefined)).to.equal(undefined);
    });

    it('must use error stack when available', () => {
      expect(tracingUtil.getErrorDetails(new Error('Whhoooopppppss'))).to.match(/Whhoooopppppss/);
    });

    it('must use error message when available', () => {
      expect(tracingUtil.getErrorDetails({ message: 'Whhoooopppppss' })).to.match(/Whhoooopppppss/);
    });

    it('must use the whole provided error when all else fails', () => {
      expect(tracingUtil.getErrorDetails('Whhoooopppppss')).to.match(/Whhoooopppppss/);
    });
  });
});
