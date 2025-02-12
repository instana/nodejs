/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');

const constants = require('../../../src/tracing/constants');

const parse = require('../../../src/tracing/w3c_trace_context/parse').execute;

const version00 = '00';
const traceParentTraceId = '0af7651916cd43dd8448eb211c80319c';
const traceParentParentId = 'b7ad6b7169203331';
const traceParentWithoutFlags = `${version00}-${traceParentTraceId}-${traceParentParentId}`;
const defaultFlags = '01';
const validTraceParent = `${traceParentWithoutFlags}-${defaultFlags}`;
const validTraceStateWithoutInstanaArray = ['rojo=00f067aa0ba902b7', 'congo=t61rcWkgMzE'];
const validTraceStateWithoutInstana = validTraceStateWithoutInstanaArray.join(',');

const instana32CharTraceId = '0123456789abcdeffedcbc9876543210';
const instana16CharTraceId = '0123456789abcdef';
const instanaSpanId = '02468acefdb97531';
const instanaWideValue = `${instana32CharTraceId};${instanaSpanId}`;
const instanaNarrowValue = `${instana16CharTraceId};${instanaSpanId}`;

const otherInstana32CharTraceId = '3456789abcdeffedcbc9876543210012';
const otherInstana16CharTraceId = '3456789abcdeffed';
const otherInstanaSpanId = '13579bdfeca86420';
const otherInstanaWideValue = `${otherInstana32CharTraceId};${otherInstanaSpanId}`;
const otherInstanaNarrowValue = `${otherInstana16CharTraceId};${otherInstanaSpanId}`;

describe('tracing/w3c-trace-context parser', () => {
  it('should reject invalid values', () => {
    const parsed = parse('some invalid traceparent', 'some invalid tracestate');
    expect(parsed.traceParentValid).to.be.false;
    expect(parsed.traceStateValid).to.be.false;
  });

  describe('traceparent value', () => {
    it('should reject non-string traceparent', () => {
      const parsed = parse({});
      expect(parsed.traceParentValid).to.be.false;
      expect(parsed.traceStateValid).to.be.false;
    });

    it('should reject all zeroes trace ID', () => {
      const parsed = parse(`01-00000000000000000000000000000000-${traceParentParentId}-${defaultFlags}`);
      expect(parsed.traceParentValid).to.be.false;
      expect(parsed.traceStateValid).to.be.false;
    });

    it('should reject all zeroes parent ID', () => {
      const parsed = parse(`01-${traceParentTraceId}-0000000000000000-${defaultFlags}`);
      expect(parsed.traceParentValid).to.be.false;
      expect(parsed.traceStateValid).to.be.false;
    });

    it('should parse version', () => {
      const parsed = parse('fe-some invalid traceparent');
      expect(parsed.version).to.equal('fe');
    });

    it('should reject version ff', () => {
      const parsed = parse('ff-some invalid traceparent');
      expect(parsed.version).to.not.exist;
    });

    it('should parse a valid traceparent header for spec version 00', () => {
      const parsed = parse(validTraceParent);
      expect(parsed.version).to.equal(version00);
      expect(parsed.traceParentTraceId).to.equal(traceParentTraceId);
      expect(parsed.traceParentParentId).to.equal(traceParentParentId);
      expect(parsed.sampled).to.be.true;
      expect(parsed.traceParentValid).to.be.true;
      expect(parsed.traceStateValid).to.be.false;
    });

    it('should reject trailing content for spec version 00', () => {
      const parsed = parse(`${validTraceParent} `);
      expect(parsed.traceParentValid).to.be.false;
    });

    it('should ignore trailing content for spec version > 00', () => {
      const traceparent = `01-${traceParentTraceId}-${traceParentParentId}-${defaultFlags}Gobbledygook`;
      const parsed = parse(traceparent);
      expect(parsed.version).to.equal('01');
      expect(parsed.traceParentTraceId).to.equal(traceParentTraceId);
      expect(parsed.traceParentParentId).to.equal(traceParentParentId);
      expect(parsed.sampled).to.be.true;
      expect(parsed.traceParentValid).to.be.true;
    });

    it('should parse a valid traceparent header when tracestate is invalid', () => {
      const parsed = parse(validTraceParent, 'an invalid tracestate header');
      expect(parsed.version).to.equal(version00);
      expect(parsed.traceParentTraceId).to.equal(traceParentTraceId);
      expect(parsed.traceParentParentId).to.equal(traceParentParentId);
      expect(parsed.sampled).to.be.true;
      expect(parsed.traceParentValid).to.be.true;
      expect(parsed.traceStateValid).to.be.false;
    });

    describe('traceparent flags', () => {
      it('should parse the sampled flag', () => {
        const parsed = parse(`${traceParentWithoutFlags}-01`);
        expect(parsed.sampled).to.be.true;
        expect(parsed.traceParentValid).to.be.true;
        expect(parsed.renderFlags()).to.equal('01');
      });

      it('should parse the random trace ID flag', () => {
        const parsed = parse(`${traceParentWithoutFlags}-02`);
        expect(parsed.randomTraceId).to.be.true;
        expect(parsed.traceParentValid).to.be.true;
        expect(parsed.renderFlags()).to.equal('02');
      });

      it('should parse the sampled flag and the random trace ID flag', () => {
        const parsed = parse(`${traceParentWithoutFlags}-03`);
        expect(parsed.sampled).to.be.true;
        expect(parsed.randomTraceId).to.be.true;
        expect(parsed.traceParentValid).to.be.true;
        expect(parsed.renderFlags()).to.equal('03');
      });

      it('should parse a traceparent header when unknown flags are present', () => {
        // all possible flags are set
        const parsed = parse(`${traceParentWithoutFlags}-ff`);
        expect(parsed.sampled).to.be.true;
        expect(parsed.randomTraceId).to.be.true;
        expect(parsed.traceParentValid).to.be.true;
        expect(parsed.traceStateValid).to.be.false;
        expect(parsed.renderFlags()).to.equal('03');
      });

      it('should parse a traceparent header with sampled = 0 when unknown flags are present', () => {
        // every flag is set except for sampled
        const parsed = parse(`${traceParentWithoutFlags}-fe`);
        expect(parsed.sampled).to.be.false;
        expect(parsed.randomTraceId).to.be.true;
        expect(parsed.traceParentValid).to.be.true;
        expect(parsed.traceStateValid).to.be.false;
        expect(parsed.renderFlags()).to.equal('02');
      });

      it('should parse a traceparent header with random trace ID = 0 when unknown flags are present', () => {
        // every flag is set except for randomg trace ID
        const parsed = parse(`${traceParentWithoutFlags}-fd`);
        expect(parsed.sampled).to.be.true;
        expect(parsed.randomTraceId).to.be.false;
        expect(parsed.traceParentValid).to.be.true;
        expect(parsed.traceStateValid).to.be.false;
        expect(parsed.renderFlags()).to.equal('01');
      });

      it('should parse a traceparent header when no flags are set', () => {
        const parsed = parse(`${traceParentWithoutFlags}-00`);
        expect(parsed.sampled).to.be.false;
        expect(parsed.randomTraceId).to.be.false;
        expect(parsed.traceParentValid).to.be.true;
        expect(parsed.traceStateValid).to.be.false;
        expect(parsed.renderFlags()).to.equal('00');
      });
    });

    describe('render an unchanged traceparent value', () => {
      it('render an empty string for an invalid traceparent value', () => {
        const parsed = parse('an invalid traceparent value');
        expect(parsed.renderTraceParent()).to.equal('');
      });

      it('render an unchanged valid traceparent value', () => {
        const parsed = parse(validTraceParent);
        expect(parsed.renderTraceParent()).to.equal(validTraceParent);
      });
    });
  });

  describe('tracestate value', () => {
    it('should reject non-string tracestate', () => {
      const parsed = parse(validTraceParent, {});
      expect(parsed.traceParentValid).to.be.true;
      expect(parsed.traceStateValid).to.be.false;
    });

    it('should ignore a valid tracestate header if traceparent is invalid', () => {
      const parsed = parse('an invalid traceparent header', validTraceStateWithoutInstana);
      expect(parsed.traceParentValid).to.be.false;
      expect(parsed.traceStateValid).to.be.false;
      expect(parsed.traceStateHead).to.not.exist;
      expect(parsed.traceStateTail).to.not.exist;
      expect(parsed.instanaTraceId).to.not.exist;
      expect(parsed.instanaParentId).to.not.exist;
    });

    it('should cope with no tracestate header', () => {
      const parsed = parse(validTraceParent);
      expect(parsed.traceParentValid).to.be.true;
      expect(parsed.traceStateValid).to.be.false;
    });

    it('should cope with an empty tracestate header', () => {
      const parsed = parse(validTraceParent, '');
      expect(parsed.traceParentValid).to.be.true;
      expect(parsed.traceStateValid).to.be.false;
    });

    describe('without an in key-value pair', () => {
      it('should parse a valid tracestate header without an in key-value pair for spec version 00', () => {
        const parsed = parse(validTraceParent, validTraceStateWithoutInstana);
        expect(parsed.traceStateValid).to.be.true;
        expect(parsed.traceStateHead).to.deep.equal(validTraceStateWithoutInstanaArray);
        expect(parsed.traceStateTail).to.not.exist;
        expect(parsed.instanaTraceId).to.not.exist;
        expect(parsed.instanaParentId).to.not.exist;
      });

      it('should drop whitespace around tracestate key-value pairs', () => {
        const withWhitespace = ' \r rojo=00f067aa0ba902b7 \r\n  , \t congo=t61rcWkgMzE\n\n';
        const parsed = parse(validTraceParent, withWhitespace);
        expect(parsed.traceStateValid).to.be.true;
        expect(parsed.traceStateHead).to.deep.equal(validTraceStateWithoutInstanaArray);
        expect(parsed.traceStateTail).to.not.exist;
        expect(parsed.instanaTraceId).to.not.exist;
        expect(parsed.instanaParentId).to.not.exist;
      });

      it('must retain spaces in values', () => {
        const withWhitespace = 'rojo= 0 0 f 0 n67aa0ba902b7';
        const parsed = parse(validTraceParent, withWhitespace);
        expect(parsed.traceStateValid).to.be.true;
        expect(parsed.traceStateHead).to.deep.equal(['rojo= 0 0 f 0 n67aa0ba902b7']);
        expect(parsed.traceStateTail).to.not.exist;
        expect(parsed.instanaTraceId).to.not.exist;
        expect(parsed.instanaParentId).to.not.exist;
      });

      it('should drop empty and whitespace-only tracestate segments', () => {
        const withEmptySegments = 'rojo=00f067aa0ba902b7,,  ,congo=t61rcWkgMzE';
        const parsed = parse(validTraceParent, withEmptySegments);
        expect(parsed.traceStateValid).to.be.true;
        expect(parsed.traceStateHead).to.deep.equal(validTraceStateWithoutInstanaArray);
        expect(parsed.traceStateTail).to.not.exist;
        expect(parsed.instanaTraceId).to.not.exist;
        expect(parsed.instanaParentId).to.not.exist;
      });

      it('should drop invalid tracestate segments', () => {
        const withInvalidSegment = 'rojo=00f067aa0ba902b7, no equal sign,congo=t61rcWkgMzE';
        const parsed = parse(validTraceParent, withInvalidSegment);
        expect(parsed.traceParentValid).to.be.true;
        expect(parsed.traceStateValid).to.be.true;
        expect(parsed.traceStateHead).to.deep.equal(validTraceStateWithoutInstanaArray);
        expect(parsed.traceStateTail).to.not.exist;
        expect(parsed.instanaTraceId).to.not.exist;
        expect(parsed.instanaParentId).to.not.exist;
      });

      it('should only accept 32 key-value pairs and drop the rest', () => {
        const tooManyPairs = new Array(35)
          .fill('')
          .map((ignored, i) => `vendor-${i}=value-${i}`)
          .join(',');
        const expected = new Array(32).fill('').map((ignored, i) => `vendor-${i}=value-${i}`);
        const parsed = parse(validTraceParent, tooManyPairs);
        expect(parsed.traceStateHead).to.deep.equal(expected);
        expect(parsed.traceStateTail).to.not.exist;
        expect(parsed.instanaTraceId).to.not.exist;
        expect(parsed.instanaParentId).to.not.exist;
      });

      it('should render the tracestate value without an in key-value pair', () => {
        const parsed = parse(validTraceParent, 'rojo=00f067aa0ba902b7, congo=t61rcWkgMzE');
        expect(parsed.renderTraceState()).to.equal('rojo=00f067aa0ba902b7,congo=t61rcWkgMzE');
      });

      it('should know that there is no tracestate content when it is invalid', () => {
        const parsed = parse(validTraceParent, 'invalid trace state');
        expect(parsed.hasTraceState()).to.be.false;
      });

      it('should render an empty string for tracestate when it is invalid', () => {
        const parsed = parse(validTraceParent, 'invalid trace state');
        expect(parsed.renderTraceState()).to.equal('');
      });

      it('should extract the most recent foreign trace state key-value pair', () => {
        const parsed = parse(validTraceParent, validTraceStateWithoutInstana);
        expect(parsed.getMostRecentForeignTraceStateMember()).to.equal('rojo=00f067aa0ba902b7');
      });

      it('should return undefined for most recent foreign trace state key-value pair if not present', () => {
        const parsed = parse(validTraceParent, '');
        expect(parsed.getMostRecentForeignTraceStateMember()).to.be.undefined;
      });
    });

    describe('with an in key-value pair', () => {
      [false, true].forEach(registerTests);

      function registerTests(shortTraceId) {
        const instanaValue = shortTraceId ? instanaNarrowValue : instanaWideValue;
        const expectedTraceId = shortTraceId ? instana16CharTraceId : instana32CharTraceId;
        const testTitleSuffix = `(${idLengthTitle(shortTraceId)})`;

        it(`should parse the in key-value pair when it's leftmost ${testTitleSuffix}`, () => {
          // eslint-disable-next-line max-len
          const traceStateWithInstana = `${` ${constants.w3cInstana}=${instanaValue}, philo=verygreen, rojo=00f067aa0ba902b7,`}congo=t61rcWkgMzE, dendron=whats-with-the-plants`;
          const parsed = parse(validTraceParent, traceStateWithInstana);
          expect(parsed.traceStateValid).to.be.true;
          expect(parsed.traceStateHead).to.not.exist;
          expect(parsed.instanaTraceId).to.equal(expectedTraceId);
          expect(parsed.instanaParentId).to.equal(instanaSpanId);
          expect(parsed.traceStateTail).to.deep.equal([
            'philo=verygreen',
            'rojo=00f067aa0ba902b7',
            'congo=t61rcWkgMzE',
            'dendron=whats-with-the-plants'
          ]);
        });

        it(`should parse the in key-value pair in the middle ${testTitleSuffix}`, () => {
          // eslint-disable-next-line max-len
          const traceStateWithInstana = `${`philo=verygreen, rojo=00f067aa0ba902b7, ${constants.w3cInstana}=${instanaValue}, congo=t61rcWkgMzE, `}dendron=whats-with-the-plants`;
          const parsed = parse(validTraceParent, traceStateWithInstana);
          expect(parsed.traceStateValid).to.be.true;
          expect(parsed.traceStateHead).to.deep.equal(['philo=verygreen', 'rojo=00f067aa0ba902b7']);
          expect(parsed.instanaTraceId).to.equal(expectedTraceId);
          expect(parsed.instanaParentId).to.equal(instanaSpanId);
          expect(parsed.traceStateTail).to.deep.equal(['congo=t61rcWkgMzE', 'dendron=whats-with-the-plants']);
        });

        it(`should parse the in key-value pair when it's rightmost ${testTitleSuffix}`, () => {
          // eslint-disable-next-line max-len
          const traceStateWithInstana = ` philo=verygreen, rojo=00f067aa0ba902b7,congo=t61rcWkgMzE, ${`dendron=whats-with-the-plants,   ${constants.w3cInstana}=${instanaValue},`}`;
          const parsed = parse(validTraceParent, traceStateWithInstana);
          expect(parsed.traceStateValid).to.be.true;
          expect(parsed.traceStateHead).to.deep.equal([
            'philo=verygreen',
            'rojo=00f067aa0ba902b7',
            'congo=t61rcWkgMzE',
            'dendron=whats-with-the-plants'
          ]);
          expect(parsed.instanaTraceId).to.equal(expectedTraceId);
          expect(parsed.instanaParentId).to.equal(instanaSpanId);
          expect(parsed.traceStateTail).to.not.exist;
        });

        it(`should ignore duplicated in key-value pairs and use the leftmost (${idLengthTitle(shortTraceId)})`, () => {
          const traceStateWithInstana =
            `philo=verygreen, ${constants.w3cInstana}=${instanaValue}, rojo=00f067aa0ba902b7,congo=t61rcWkgMzE, ` +
            `${constants.w3cInstana}=${otherInstanaWideValue}, dendron=whats-with-the-plants, ` +
            `${constants.w3cInstana}=${otherInstanaNarrowValue}`;
          const parsed = parse(validTraceParent, traceStateWithInstana);
          expect(parsed.traceStateValid).to.be.true;
          expect(parsed.traceStateHead).to.deep.equal(['philo=verygreen']);
          expect(parsed.instanaTraceId).to.equal(expectedTraceId);
          expect(parsed.instanaParentId).to.equal(instanaSpanId);
          expect(parsed.traceStateTail).to.deep.equal([
            'rojo=00f067aa0ba902b7',
            'congo=t61rcWkgMzE',
            'dendron=whats-with-the-plants'
          ]);
        });

        // eslint-disable-next-line max-len
        it(`should capture in key-value pair before dropping excessive key-value pairs if in ${`comes late ${testTitleSuffix}`}`, () => {
          const tooManyPairs = new Array(35)
            .fill('')
            .map((ignored, i) => `vendor-${i}=value-${i}`)
            .concat(`${constants.w3cInstana}=${instanaValue}`)
            .concat('vendor-99=value-99')
            .join(',');
          const expected = new Array(31).fill('').map((ignored, i) => `vendor-${i}=value-${i}`);
          const parsed = parse(validTraceParent, tooManyPairs);
          expect(parsed.traceStateHead).to.deep.equal(expected);
          expect(parsed.instanaTraceId).to.equal(expectedTraceId);
          expect(parsed.instanaParentId).to.equal(instanaSpanId);
          expect(parsed.traceStateTail).to.not.exist;
        });

        // eslint-disable-next-line max-len
        it(`should capture in key-value pair before dropping excessive key-value pairs if in ${`comes early ${testTitleSuffix}`}`, () => {
          const tooManyPairs = [`${constants.w3cInstana}=${instanaValue}`]
            .concat(new Array(35).fill('').map((ignored, i) => `vendor-${i}=value-${i}`))
            .join(',');
          const expected = new Array(31).fill('').map((ignored, i) => `vendor-${i}=value-${i}`);
          const parsed = parse(validTraceParent, tooManyPairs);
          expect(parsed.traceStateHead).to.not.exist;
          expect(parsed.instanaTraceId).to.equal(expectedTraceId);
          expect(parsed.instanaParentId).to.equal(instanaSpanId);
          expect(parsed.traceStateTail).to.deep.equal(expected);
        });

        it(`should render the tracestate value ${testTitleSuffix}`, () => {
          const parsed = parse(
            validTraceParent,
            `rojo=00f067aa0ba902b7, ${constants.w3cInstana}=${instanaValue}, congo=t61rcWkgMzE`
          );
          const renderedTraceState = parsed.renderTraceState();
          expect(renderedTraceState).to.equal(
            `rojo=00f067aa0ba902b7,${constants.w3cInstana}=${instanaValue},congo=t61rcWkgMzE`
          );
        });

        it('should extract the most recent foreign trace state key-value pair', () => {
          // eslint-disable-next-line max-len
          const traceStateWithInstana = `${`   philo=verygreen , rojo=00f067aa0ba902b7, ${constants.w3cInstana}=${instanaValue}, congo=t61rcWkgMzE, `}dendron=whats-with-the-plants`;
          const parsed = parse(validTraceParent, traceStateWithInstana);
          expect(parsed.getMostRecentForeignTraceStateMember()).to.equal('philo=verygreen');
        });
      }

      it('should reject an empty trace ID', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=;aaaaaaaaaaaaaaaa,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaTraceId).to.not.exist;
        expect(parsed.instanaParentId).to.equal('aaaaaaaaaaaaaaaa');
      });

      it('should left-pad a trace ID shorter than 16 chars to 16 chars', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=123456789abcdef;aaaaaaaaaaaaaaaa,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaTraceId).to.equal('0123456789abcdef');
      });

      it('should not left-pad a 16 char trace ID', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=123456789abcdef0;aaaaaaaaaaaaaaaa,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaTraceId).to.equal('123456789abcdef0');
      });

      it('should left-pad a trace ID longer than 16 chars but shorter than 32 chars to 32 chars', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=123456789abcdef0123456789abcdef;aaaaaaaaaaaaaaaa,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaTraceId).to.equal('0123456789abcdef0123456789abcdef');
      });

      it('should not left-pad 32 char trace ID', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=123456789abcdef0123456789abcdef0;aaaaaaaaaaaaaaaa,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaTraceId).to.equal('123456789abcdef0123456789abcdef0');
      });

      it('should reject a trace ID longer than 32 chars', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=123456789abcdef0123456789abcdef00;aaaaaaaaaaaaaaaa,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaTraceId).to.not.exist;
      });

      it('should reject an empty parent ID', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=aaaaaaaaaaaaaaaa;,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaTraceId).to.equal('aaaaaaaaaaaaaaaa');
        expect(parsed.instanaParentId).to.not.exist;
      });

      it('should left-pad a parent ID shorter than 16 chars to 16 chars', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=aaaaaaaaaaaaaaaa;123456789abcdef,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaParentId).to.equal('0123456789abcdef');
      });

      it('should not left-pad a 16 char parent ID', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=aaaaaaaaaaaaaaaa;123456789abcdef0,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaParentId).to.equal('123456789abcdef0');
      });

      it('should reject a parent ID longer than 16', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=aaaaaaaaaaaaaaaa;123456789abcdef0123456789abcdef,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaParentId).to.not.exist;
      });

      it('should reject a 32 char parent ID', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=aaaaaaaaaaaaaaaa;123456789abcdef0123456789abcdef0,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaParentId).to.not.exist;
      });

      it('should reject a parent ID longer than 32 chars', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=aaaaaaaaaaaaaaaa;123456789abcdef0123456789abcdef00,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaParentId).to.not.exist;
      });

      it('should ignore additional fields in the in key-value pair', () => {
        const traceState = `foo=bar,${constants.w3cInstana}=aaaaaaaaaaaaaaaa;bbbbbbbbbbbbbbbb;1;2;3,bar=baz`;
        const parsed = parse(validTraceParent, traceState);
        expect(parsed.instanaTraceId).to.equal('aaaaaaaaaaaaaaaa');
        expect(parsed.instanaParentId).to.equal('bbbbbbbbbbbbbbbb');
      });
    });
  });
});

function idLengthTitle(shortId) {
  return shortId ? 'narrow' : 'wide';
}
