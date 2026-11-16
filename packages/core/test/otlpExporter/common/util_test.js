/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { toTraceId, toSpanId, toTimeUnixNano } = require('../../../src/otlpExporter/common/util');

describe('otlpExporter/common/util', () => {
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
});
