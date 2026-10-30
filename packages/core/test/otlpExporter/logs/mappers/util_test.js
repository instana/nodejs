/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const {
  toTraceId,
  toSpanId,
  toTimeUnixNano,
  toBody,
  toSeverityText,
  toSeverityNumber
} = require('../../../../src/otlpExporter/logs/mappers/util');

describe('otlpExporter/logs/mappers/util', () => {
  describe('toTraceId', () => {
    it('should pad the trace id to 32 characters', () => {
      expect(toTraceId('abc')).to.equal('00000000000000000000000000000abc');
    });

    it('should keep a 32 character trace id', () => {
      const id = 'a'.repeat(32);
      expect(toTraceId(id)).to.equal(id);
    });

    it('should return an empty string for empty values', () => {
      expect(toTraceId('')).to.equal('');
      expect(toTraceId(null)).to.equal('');
    });
  });

  describe('toSpanId', () => {
    it('should pad the span id to 16 characters', () => {
      expect(toSpanId('def')).to.equal('0000000000000def');
    });

    it('should keep a 16 character span id', () => {
      const id = 'b'.repeat(16);
      expect(toSpanId(id)).to.equal(id);
    });

    it('should return an empty string for empty values', () => {
      expect(toSpanId('')).to.equal('');
      expect(toSpanId(undefined)).to.equal('');
    });
  });

  describe('toTimeUnixNano', () => {
    it('should convert milliseconds to nanoseconds', () => {
      expect(toTimeUnixNano(1544712660300)).to.equal('1544712660300000000');
    });

    it('should handle zero', () => {
      expect(toTimeUnixNano(0)).to.equal('0');
    });
  });

  describe('toBody', () => {
    it('should wrap the message in a stringValue', () => {
      expect(toBody('Example log record')).to.deep.equal({ stringValue: 'Example log record' });
    });

    it('should convert non string messages to strings', () => {
      expect(toBody(42)).to.deep.equal({ stringValue: '42' });
    });
  });

  describe('toSeverityText', () => {
    it('should keep the level as written by the source', () => {
      expect(toSeverityText('warn')).to.equal('warn');
      expect(toSeverityText('Info')).to.equal('Info');
      expect(toSeverityText('Weird')).to.equal('Weird');
    });

    it('should return undefined for an empty level', () => {
      expect(toSeverityText('')).to.equal(undefined);
      expect(toSeverityText('   ')).to.equal(undefined);
    });
  });

  describe('toSeverityNumber', () => {
    [
      ['trace', 1],
      ['debug', 5],
      ['info', 9],
      ['warn', 13],
      ['error', 17],
      ['fatal', 21]
    ].forEach(([level, expected]) => {
      it(`should map ${level} to ${expected}`, () => {
        expect(toSeverityNumber(level)).to.equal(expected);
      });
    });

    it('should be case insensitive', () => {
      expect(toSeverityNumber('ERROR')).to.equal(17);
    });

    it('should trim the level before the lookup', () => {
      expect(toSeverityNumber(' error ')).to.equal(17);
    });

    it('should return undefined for an empty level', () => {
      expect(toSeverityNumber('')).to.equal(undefined);
      expect(toSeverityNumber('   ')).to.equal(undefined);
    });

    it('should map unknown levels to 0', () => {
      expect(toSeverityNumber('unknown')).to.equal(0);
    });

    it('should not resolve inherited object properties', () => {
      expect(toSeverityNumber('constructor')).to.equal(0);
    });
  });
});
