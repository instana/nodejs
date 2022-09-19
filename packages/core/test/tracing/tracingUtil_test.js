/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

/* eslint-disable no-useless-concat */

'use strict';

const expect = require('chai').expect;
const fail = require('assert').fail;
const util = require('util');

const config = require('../config');

const {
  generateRandomId,
  generateRandomSpanId,
  generateRandomTraceId,
  getErrorDetails,
  readTraceContextFromBuffer,
  sanitizeConnectionStr,
  unsignedHexStringToBuffer,
  unsignedHexStringsToBuffer
} = require('../../src/tracing/tracingUtil');

describe('tracing/tracingUtil', () => {
  describe('generate random IDs', function () {
    this.timeout(config.getTestTimeout() * 10);

    testRandomIds('trace', generateRandomTraceId, 16);
    testRandomIds('span', generateRandomSpanId, 16);

    // The following line checks that 128 bit (32 char)  IDs are generated okay, although we do not yet need
    // 128 bit IDs (yet). It can be removed once trace IDs are upped to 128 bit.
    testRandomIds('128 bit', generateRandomId.bind(null, 32), 32);

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

  describe('benchmark ID generation', function () {
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
          generateRandomSpanId(length);
        }
        const duration = Date.now() - start;
        expect(duration).to.be.lte(maxAcceptableDuration);
      });
    }
  });

  describe('trace/span ID conversion', () => {
    describe('unsigned hex string to buffer', () => {
      it('64 bit/16 chars to 8 byte buffer', () => {
        verifyBuffers(
          unsignedHexStringToBuffer('8000000000000000'),
          Buffer.from([0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('8000000000000001'),
          Buffer.from([0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('ffffffffffffffef'),
          Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xef])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('fffffffffffffff0'),
          Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xf0])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('fffffffffffffff1'),
          Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xf1])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('fffffffffffffffe'),
          Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('ffffffffffffffff'),
          Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
        );

        verifyBuffers(
          unsignedHexStringToBuffer('0000000000000000'),
          Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('0000000000000001'),
          Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('000000000000000f'),
          Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('0000000000000010'),
          Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('7ffffffffffffffe'),
          Buffer.from([0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe])
        );
        verifyBuffers(
          unsignedHexStringToBuffer('7fffffffffffffff'),
          Buffer.from([0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
        );
      });

      it('128 bit/32 chars to 16 byte buffer', () => {
        verifyBuffers(
          unsignedHexStringToBuffer('8000000000000000' + '7ffffffffffffffe'),
          Buffer.from([0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe])
        );
      });
    });

    describe('buffer to unsigned hex strings', () => {
      it('with 64 bit trace ID (first 8 bytes are zero)', () => {
        // prettier-ignore
        expect(readTraceContextFromBuffer(
          Buffer.from(
            [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
             0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
             0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff //
            ])
          )
        ).to.deep.equal({ t: '8000000000000000', s: 'ffffffffffffffff' });
        // prettier-ignore
        expect(readTraceContextFromBuffer(
          Buffer.from(
            [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
             0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, //
             0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02 //
            ])
          )
        ).to.deep.equal({ t: '0000000000000001', s: '0000000000000002' });
        // prettier-ignore
        expect(readTraceContextFromBuffer(
          Buffer.from(
            [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
             0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, //
             0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f //
            ])
          )
        ).to.deep.equal({ t: '7fffffffffffffff', s: '0f0f0f0f0f0f0f0f' });
      });

      it('with 128 bit trace ID (first 8 bytes contain at least one non-null byte)', () => {
        // prettier-ignore
        expect(readTraceContextFromBuffer(
          Buffer.from(
            [0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, //
             0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
             0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff //
            ])
          )
        ).to.deep.equal({ t: 'f0f0f0f0f0f0f0f0' + '8000000000000000', s: 'ffffffffffffffff' });
        // prettier-ignore
        expect(readTraceContextFromBuffer(
          Buffer.from(
            [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, //
             0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, //
             0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03 //
            ])
          )
        ).to.deep.equal({ t: '0000000000000001' + '0000000000000002', s: '0000000000000003' });
        // prettier-ignore
        expect(readTraceContextFromBuffer(
          Buffer.from(
            [0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, //
             0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, //
             0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f //
            ])
          )
        ).to.deep.equal({ t: 'f0f0f0f0f0f0f0f0' + '7fffffffffffffff', s: '0f0f0f0f0f0f0f0f' });
      });
    });

    describe('roundtrips', () => {
      it('hex string -> buffer -> hex string roundtrip (span ID)', () => {
        expect(hexString2Buffer2HexStringSpanId('8000000000000000')).to.equal('8000000000000000');
        expect(hexString2Buffer2HexStringSpanId('8000000000000001')).to.equal('8000000000000001');
        expect(hexString2Buffer2HexStringSpanId('ffffffffffffffef')).to.equal('ffffffffffffffef');
        expect(hexString2Buffer2HexStringSpanId('fffffffffffffff0')).to.equal('fffffffffffffff0');
        expect(hexString2Buffer2HexStringSpanId('fffffffffffffff1')).to.equal('fffffffffffffff1');
        expect(hexString2Buffer2HexStringSpanId('fffffffffffffffe')).to.equal('fffffffffffffffe');
        expect(hexString2Buffer2HexStringSpanId('ffffffffffffffff')).to.equal('ffffffffffffffff');
        expect(hexString2Buffer2HexStringSpanId('0000000000000000')).to.equal('0000000000000000');
        expect(hexString2Buffer2HexStringSpanId('0000000000000001')).to.equal('0000000000000001');
        expect(hexString2Buffer2HexStringSpanId('000000000000000f')).to.equal('000000000000000f');
        expect(hexString2Buffer2HexStringSpanId('0000000000000010')).to.equal('0000000000000010');
        expect(hexString2Buffer2HexStringSpanId('7ffffffffffffffe')).to.equal('7ffffffffffffffe');
        expect(hexString2Buffer2HexStringSpanId('7fffffffffffffff')).to.equal('7fffffffffffffff');
      });

      it('hex string -> buffer -> hex string roundtrip (trace ID 64 bit)', () => {
        expect(hexString2Buffer2HexStringTraceId64('8000000000000000')).to.equal('8000000000000000');
        expect(hexString2Buffer2HexStringTraceId64('8000000000000001')).to.equal('8000000000000001');
        expect(hexString2Buffer2HexStringTraceId64('ffffffffffffffef')).to.equal('ffffffffffffffef');
        expect(hexString2Buffer2HexStringTraceId64('fffffffffffffff0')).to.equal('fffffffffffffff0');
        expect(hexString2Buffer2HexStringTraceId64('fffffffffffffff1')).to.equal('fffffffffffffff1');
        expect(hexString2Buffer2HexStringTraceId64('fffffffffffffffe')).to.equal('fffffffffffffffe');
        expect(hexString2Buffer2HexStringTraceId64('ffffffffffffffff')).to.equal('ffffffffffffffff');
        expect(hexString2Buffer2HexStringTraceId64('0000000000000000')).to.equal('0000000000000000');
        expect(hexString2Buffer2HexStringTraceId64('0000000000000001')).to.equal('0000000000000001');
        expect(hexString2Buffer2HexStringTraceId64('000000000000000f')).to.equal('000000000000000f');
        expect(hexString2Buffer2HexStringTraceId64('0000000000000010')).to.equal('0000000000000010');
        expect(hexString2Buffer2HexStringTraceId64('7ffffffffffffffe')).to.equal('7ffffffffffffffe');
        expect(hexString2Buffer2HexStringTraceId64('7fffffffffffffff')).to.equal('7fffffffffffffff');
      });

      it('hex string -> buffer -> hex string roundtrip (trace ID 128 bit)', () => {
        expect(hexString2Buffer2HexStringTraceId128('8000000000000000' + '8000000000000001')).to.equal(
          '8000000000000000' + '8000000000000001'
        );
        expect(hexString2Buffer2HexStringTraceId128('ffffffffffffffef' + 'fffffffffffffff0')).to.equal(
          'ffffffffffffffef' + 'fffffffffffffff0'
        );
        expect(hexString2Buffer2HexStringTraceId128('fffffffffffffff1' + 'fffffffffffffffe')).to.equal(
          'fffffffffffffff1' + 'fffffffffffffffe'
        );

        // As long as we support 64 bit trace IDs on the wire and not 128 bit trace IDs, it is actually correct that
        // the all-zero hi trace ID part gets lost in the round trip.
        expect(hexString2Buffer2HexStringTraceId128('0000000000000000' + 'ffffffffffffffff')).to.equal(
          'ffffffffffffffff'
        );

        expect(hexString2Buffer2HexStringTraceId128('ffffffffffffffff' + '0000000000000000')).to.equal(
          'ffffffffffffffff' + '0000000000000000'
        );
        expect(hexString2Buffer2HexStringTraceId128('0000000000000001' + '000000000000000f')).to.equal(
          '0000000000000001' + '000000000000000f'
        );
        expect(hexString2Buffer2HexStringTraceId128('7ffffffffffffffe' + '0000000000000010')).to.equal(
          '7ffffffffffffffe' + '0000000000000010'
        );
        expect(hexString2Buffer2HexStringTraceId128('7fffffffffffffff' + '8000000000000000')).to.equal(
          '7fffffffffffffff' + '8000000000000000'
        );
      });

      it('buffer -> hex string -> buffer roundtrip (128 bit trace ID)', () => {
        // prettier-ignore
        verifyBuffer2HexStrings2Buffer(
          [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, //
           0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, //
           0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x00, 0x01 //
          ]
        );
      });

      it('buffer -> hex string -> buffer roundtrip (64 bit trace ID)', () => {
        // prettier-ignore
        verifyBuffer2HexStrings2Buffer(
          [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
           0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, //
           0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x00, 0x01 //
          ]
        );
      });
    });

    function hexString2Buffer2HexStringSpanId(hexString) {
      const buffer = unsignedHexStringToBuffer(hexString);
      const traceContextBuffer = Buffer.concat([allZeroesBuffer(), allZeroesBuffer(), buffer], 24);
      return readTraceContextFromBuffer(traceContextBuffer).s;
    }

    function hexString2Buffer2HexStringTraceId64(hexString) {
      const buffer = unsignedHexStringToBuffer(hexString);
      const traceContextBuffer = Buffer.concat([allZeroesBuffer(), buffer, allZeroesBuffer()], 24);
      return readTraceContextFromBuffer(traceContextBuffer).t;
    }

    function hexString2Buffer2HexStringTraceId128(hexString) {
      const buffer = unsignedHexStringToBuffer(hexString);
      const traceContextBuffer = Buffer.concat([buffer, allZeroesBuffer(), allZeroesBuffer()], 24);
      return readTraceContextFromBuffer(traceContextBuffer).t;
    }

    function verifyBuffer2HexStrings2Buffer(array) {
      const bufferIn = Buffer.from(array);
      const bufferOut = buffer2HexStrings2Buffer(bufferIn);
      verifyBuffers(bufferOut, bufferIn);
    }

    function buffer2HexStrings2Buffer(buffer) {
      const traceContext = readTraceContextFromBuffer(buffer);
      return unsignedHexStringsToBuffer(traceContext.t, traceContext.s);
    }

    function verifyBuffers(actual, expected) {
      if (!Buffer.isBuffer(actual)) {
        fail(`not a buffer - type: ${typeof actual}, value:\n "${util.inspect(actual)}`);
      }
      if (expected.length !== actual.length) {
        fail(`length mismatch,\nexpected "${util.inspect(expected)}"\nactual   "${util.inspect(actual)}"`);
      }
      for (let i = 0; i < expected.length; i++) {
        if (expected.readInt8(i) !== actual.readInt8(i)) {
          fail(`mismatch at index ${i},\nexpected ${util.inspect(expected)}\nactual   ${util.inspect(actual)}`);
        }
      }
    }

    function allZeroesBuffer() {
      return Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    }
  });

  describe('getErrorDetails', () => {
    it('must not fail on null/undefined', () => {
      expect(getErrorDetails(null)).to.equal(undefined);
      expect(getErrorDetails(undefined)).to.equal(undefined);
    });

    it('must use error stack when available', () => {
      expect(getErrorDetails(new Error('Whhoooopppppss'))).to.match(/Whhoooopppppss/);
    });

    it('must use error message when available', () => {
      expect(getErrorDetails({ message: 'Whhoooopppppss' })).to.match(/Whhoooopppppss/);
    });

    it('must use the whole provided error when all else fails', () => {
      expect(getErrorDetails('Whhoooopppppss')).to.match(/Whhoooopppppss/);
    });
  });

  describe('sanitizeConnectionStr', () => {
    it('should redact password at the start of the connection string', () => {
      expect(
        sanitizeConnectionStr(
          'PWD=123456;DATABASE=MY_DATABASE;HOSTNAME=localhost;PORT=50000;PROTOCOL=TCPIP;UID=my_user'
        )
      ).to.equal('PWD=<redacted>;DATABASE=MY_DATABASE;HOSTNAME=localhost;PORT=50000;PROTOCOL=TCPIP;UID=my_user');
    });

    it('should redact password in the middle of the connection string', () => {
      expect(
        sanitizeConnectionStr(
          'DATABASE=MY_DATABASE;HOSTNAME=localhost;PORT=50000;PWD=123456;PROTOCOL=TCPIP;UID=my_user'
        )
      ).to.equal('DATABASE=MY_DATABASE;HOSTNAME=localhost;PORT=50000;PWD=<redacted>;PROTOCOL=TCPIP;UID=my_user');
    });

    it('should redact password with whitespaces', () => {
      expect(
        sanitizeConnectionStr(
          'DATABASE=MY_DATABASE;HOSTNAME=localhost;PORT=50000; \t PWD \n =  \r123456 ;PROTOCOL=TCPIP;UID=my_user'
        )
      ).to.equal('DATABASE=MY_DATABASE;HOSTNAME=localhost;PORT=50000; \t PWD=<redacted>;PROTOCOL=TCPIP;UID=my_user');
    });

    it('should redact password at the end of the connection string', () => {
      expect(
        sanitizeConnectionStr(
          'DATABASE=MY_DATABASE;HOSTNAME=localhost;PORT=50000;PROTOCOL=TCPIP;UID=my_user;PWD=123456'
        )
      ).to.equal('DATABASE=MY_DATABASE;HOSTNAME=localhost;PORT=50000;PROTOCOL=TCPIP;UID=my_user;PWD=<redacted>');
    });
  });
});
