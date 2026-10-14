/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const {
  normalizeLevel,
  transformBody,
  transformSeverityText,
  transformSeverityNumber,
  transformTraceId,
  transformSpanId,
  transformTimeUnixNano
} = require('../../../../src/otlpExporter/logs/mappers/util');

describe('otlpExporter/logs/mappers/util', () => {
  // ─── normalizeLevel ────────────────────────────────────────────────────────

  describe('normalizeLevel', () => {
    it('uppercases standard levels', () => {
      expect(normalizeLevel('info')).to.equal('INFO');
      expect(normalizeLevel('debug')).to.equal('DEBUG');
      expect(normalizeLevel('error')).to.equal('ERROR');
    });

    it('maps WARNING → WARN', () => {
      expect(normalizeLevel('WARNING')).to.equal('WARN');
      expect(normalizeLevel('warning')).to.equal('WARN');
    });

    it('maps CRITICAL → FATAL', () => {
      expect(normalizeLevel('CRITICAL')).to.equal('FATAL');
      expect(normalizeLevel('critical')).to.equal('FATAL');
    });
  });

  // ─── transformBody ─────────────────────────────────────────────────────────

  describe('transformBody', () => {
    it('wraps the log message in a stringValue object', () => {
      expect(transformBody({ data: { log: { message: 'hello world' } } })).to.deep.equal({
        stringValue: 'hello world'
      });
    });

    it('coerces a numeric message to string', () => {
      expect(transformBody({ data: { log: { message: 42 } } })).to.deep.equal({ stringValue: '42' });
    });

    it('returns undefined when message is absent', () => {
      expect(transformBody({ data: { log: {} } })).to.be.undefined;
    });

    it('returns undefined when data.log is absent', () => {
      expect(transformBody({ data: {} })).to.be.undefined;
    });

    it('returns undefined when data is absent', () => {
      expect(transformBody({})).to.be.undefined;
    });
  });

  // ─── transformSeverityText ─────────────────────────────────────────────────

  describe('transformSeverityText', () => {
    it('returns canonical text for known levels', () => {
      expect(transformSeverityText({ data: { log: { level: 'info' } } })).to.equal('INFO');
      expect(transformSeverityText({ data: { log: { level: 'warn' } } })).to.equal('WARN');
      expect(transformSeverityText({ data: { log: { level: 'error' } } })).to.equal('ERROR');
      expect(transformSeverityText({ data: { log: { level: 'debug' } } })).to.equal('DEBUG');
      expect(transformSeverityText({ data: { log: { level: 'fatal' } } })).to.equal('FATAL');
      expect(transformSeverityText({ data: { log: { level: 'trace' } } })).to.equal('TRACE');
    });

    it('normalises WARNING → WARN', () => {
      expect(transformSeverityText({ data: { log: { level: 'WARNING' } } })).to.equal('WARN');
    });

    it('normalises CRITICAL → FATAL', () => {
      expect(transformSeverityText({ data: { log: { level: 'CRITICAL' } } })).to.equal('FATAL');
    });

    it('falls back to ec > 0 → ERROR when no level', () => {
      expect(transformSeverityText({ ec: 1 })).to.equal('ERROR');
    });

    it('falls back to ec === 0 → WARN when no level', () => {
      expect(transformSeverityText({ ec: 0 })).to.equal('WARN');
    });

    it('returns undefined when no level and no ec', () => {
      expect(transformSeverityText({ data: { log: {} } })).to.be.undefined;
    });
  });

  // ─── transformSeverityNumber ───────────────────────────────────────────────

  describe('transformSeverityNumber', () => {
    it('returns 9 for INFO', () => {
      expect(transformSeverityNumber({ data: { log: { level: 'info' } } })).to.equal(9);
    });

    it('returns 13 for WARN', () => {
      expect(transformSeverityNumber({ data: { log: { level: 'warn' } } })).to.equal(13);
    });

    it('returns 17 for ERROR', () => {
      expect(transformSeverityNumber({ data: { log: { level: 'error' } } })).to.equal(17);
    });

    it('returns 21 for FATAL', () => {
      expect(transformSeverityNumber({ data: { log: { level: 'fatal' } } })).to.equal(21);
    });

    it('returns 5 for DEBUG', () => {
      expect(transformSeverityNumber({ data: { log: { level: 'debug' } } })).to.equal(5);
    });

    it('returns 1 for TRACE', () => {
      expect(transformSeverityNumber({ data: { log: { level: 'trace' } } })).to.equal(1);
    });

    it('falls back to ec > 0 → 17 (ERROR)', () => {
      expect(transformSeverityNumber({ ec: 1 })).to.equal(17);
    });

    it('falls back to ec === 0 → 13 (WARN)', () => {
      expect(transformSeverityNumber({ ec: 0 })).to.equal(13);
    });

    it('returns undefined when no level and no ec', () => {
      expect(transformSeverityNumber({ data: { log: {} } })).to.be.undefined;
    });
  });

  // ─── transformTraceId ──────────────────────────────────────────────────────

  describe('transformTraceId', () => {
    it('zero-pads a 16-char trace ID to 32 chars', () => {
      expect(transformTraceId({ t: 'b2cceaf591116691' })).to.equal('0000000000000000b2cceaf591116691');
    });

    it('leaves a 32-char trace ID unchanged', () => {
      expect(transformTraceId({ t: 'aabbccddeeff00001122334455667788' })).to.equal(
        'aabbccddeeff00001122334455667788'
      );
    });

    it('returns undefined when span.t is undefined', () => {
      expect(transformTraceId({})).to.be.undefined;
    });

    it('returns empty string when span.t is falsy (empty string)', () => {
      expect(transformTraceId({ t: '' })).to.equal('');
    });
  });

  // ─── transformSpanId ───────────────────────────────────────────────────────

  describe('transformSpanId', () => {
    it('zero-pads a short span ID to 16 chars', () => {
      expect(transformSpanId({ s: '612e34cc' })).to.equal('00000000612e34cc');
    });

    it('leaves a 16-char span ID unchanged', () => {
      expect(transformSpanId({ s: '612e34ccffefed96' })).to.equal('612e34ccffefed96');
    });

    it('uses span.s (own ID), not span.p (parent ID)', () => {
      const span = { s: 'aaaa1111bbbb2222', p: 'cccc3333dddd4444' };
      expect(transformSpanId(span)).to.equal('aaaa1111bbbb2222');
    });

    it('returns undefined when span.s is undefined', () => {
      expect(transformSpanId({})).to.be.undefined;
    });

    it('returns empty string when span.s is falsy (empty string)', () => {
      expect(transformSpanId({ s: '' })).to.equal('');
    });
  });

  // ─── transformTimeUnixNano ─────────────────────────────────────────────────

  describe('transformTimeUnixNano', () => {
    it('converts milliseconds to nanoseconds', () => {
      expect(transformTimeUnixNano({ ts: 1710000000000 })).to.equal('1710000000000000000');
    });

    it('returns a string (not a number)', () => {
      expect(transformTimeUnixNano({ ts: 1000 })).to.be.a('string');
    });

    it('returns undefined when ts is undefined', () => {
      expect(transformTimeUnixNano({})).to.be.undefined;
    });

    it('returns undefined when ts is null', () => {
      expect(transformTimeUnixNano({ ts: null })).to.be.undefined;
    });
  });
});
