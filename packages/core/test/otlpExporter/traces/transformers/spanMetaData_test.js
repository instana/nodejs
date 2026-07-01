/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');

const { OTLP_SPAN_KINDS, OTLP_STATUS_CODES } = require('../../../../src/otlpExporter/traces/mappers/constants');

describe('otlpExporter/traces/transformers/spanMetaData', () => {
  let extractSpanMetadata;
  let mockContext;
  let mockMapper;

  beforeEach(() => {
    mockContext = {
      semConv: {
        metadata: {
          TRACE_ID: 'traceId',
          SPAN_ID: 'spanId',
          PARENT_ID: 'parentSpanId',
          SPAN_KIND: 'kind',
          START_TIME_UNIX_NANO: 'startTimeUnixNano',
          END_TIME_UNIX_NANO: 'endTimeUnixNano',
          NAME: 'name',
          STATUS: 'status'
        }
      }
    };

    mockMapper = {
      spanName: sinon.stub().returns('test.span'),
      spanStatus: sinon.stub().returns({ code: OTLP_STATUS_CODES.UNSET })
    };

    const spanMetaDataModule = proxyquire('../../../../src/otlpExporter/traces/transformers/spanMetaData', {
      '../../common/context': mockContext
    });

    extractSpanMetadata = spanMetaDataModule.extractSpanMetadata;
  });

  describe('extractSpanMetadata', () => {
    it('should extract all metadata fields from a complete span', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        p: '1111222233334444',
        k: 1,
        ts: 1609459200000,
        d: 100
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result).to.deep.equal({
        traceId: '00000000000000001234567890abcdef',
        spanId: 'fedcba0987654321',
        parentSpanId: '1111222233334444',
        kind: OTLP_SPAN_KINDS.SERVER,
        startTimeUnixNano: '1609459200000000000',
        endTimeUnixNano: '1609459200100000000',
        name: 'test.span',
        status: { code: OTLP_STATUS_CODES.UNSET }
      });

      expect(mockMapper.spanName.calledOnceWith(span)).to.be.true;
      expect(mockMapper.spanStatus.calledOnceWith(span)).to.be.true;
    });

    it('should pad trace ID to 32 characters', () => {
      const span = {
        t: 'abc123',
        s: '123',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.traceId).to.equal('00000000000000000000000000abc123');
      expect(result.traceId).to.have.lengthOf(32);
    });

    it('should pad span ID to 16 characters', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'abc',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.spanId).to.equal('0000000000000abc');
      expect(result.spanId).to.have.lengthOf(16);
    });

    it('should pad parent ID to 16 characters', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        p: '123',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.parentSpanId).to.equal('0000000000000123');
      expect(result.parentSpanId).to.have.lengthOf(16);
    });

    it('should convert span kind 1 to SERVER', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        k: 1,
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.kind).to.equal(OTLP_SPAN_KINDS.SERVER);
    });

    it('should convert span kind 2 to CLIENT', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        k: 2,
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.kind).to.equal(OTLP_SPAN_KINDS.CLIENT);
    });

    it('should convert span kind 3 to INTERNAL', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        k: 3,
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.kind).to.equal(OTLP_SPAN_KINDS.INTERNAL);
    });

    it('should convert unknown span kind to UNSPECIFIED', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        k: 99,
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.kind).to.equal(OTLP_SPAN_KINDS.UNSPECIFIED);
    });

    it('should convert span kind 0 to UNSPECIFIED', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        k: 0,
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.kind).to.equal(OTLP_SPAN_KINDS.UNSPECIFIED);
    });

    it('should convert timestamps to nanoseconds', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        ts: 1609459200000, // milliseconds
        d: 150 // milliseconds
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.startTimeUnixNano).to.equal('1609459200000000000');
      expect(result.endTimeUnixNano).to.equal('1609459200150000000');
    });

    it('should calculate end time from start time and duration', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        ts: 1000,
        d: 500
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.startTimeUnixNano).to.equal('1000000000');
      expect(result.endTimeUnixNano).to.equal('1500000000');
    });

    it('should handle zero duration', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        ts: 1000,
        d: 0
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.startTimeUnixNano).to.equal('1000000000');
      expect(result.endTimeUnixNano).to.equal('1000000000');
    });

    it('should handle missing duration (defaults to 0)', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        ts: 1000
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.startTimeUnixNano).to.equal('1000000000');
      expect(result.endTimeUnixNano).to.equal('1000000000');
    });

    it('should handle missing start time (defaults to 0)', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        d: 100
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.endTimeUnixNano).to.equal('100000000');
    });

    it('should exclude undefined trace ID', () => {
      const span = {
        s: 'fedcba0987654321',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result).to.not.have.property('traceId');
    });

    it('should exclude undefined span ID', () => {
      const span = {
        t: '1234567890abcdef',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result).to.not.have.property('spanId');
    });

    it('should exclude undefined parent ID', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result).to.not.have.property('parentSpanId');
    });

    it('should include undefined span kind as unspecified', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result).to.have.property('kind');
    });

    it('should exclude undefined start time', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result).to.not.have.property('startTimeUnixNano');
    });

    it('should handle empty string trace ID', () => {
      const span = {
        t: '',
        s: 'fedcba0987654321',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.traceId).to.equal('');
    });

    it('should handle empty string span ID', () => {
      const span = {
        t: '1234567890abcdef',
        s: '',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.spanId).to.equal('');
    });

    it('should handle empty string parent ID', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        p: '',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.parentSpanId).to.equal('');
    });

    it('should handle zero values for IDs', () => {
      const span = {
        t: 0,
        s: 0,
        p: 0,
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.traceId).to.equal('');
      expect(result.spanId).to.equal('');
      expect(result.parentSpanId).to.equal('');
    });

    it('should call mapper.spanName with the span', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        ts: 1000,
        d: 10
      };

      mockMapper.spanName.returns('custom.span.name');

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.name).to.equal('custom.span.name');
      expect(mockMapper.spanName.calledOnceWith(span)).to.be.true;
    });

    it('should call mapper.spanStatus with the span', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        ts: 1000,
        d: 10,
        ec: 1
      };

      const expectedStatus = {
        code: OTLP_STATUS_CODES.ERROR,
        message: 'Test error'
      };
      mockMapper.spanStatus.returns(expectedStatus);

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.status).to.deep.equal(expectedStatus);
      expect(mockMapper.spanStatus.calledOnceWith(span)).to.be.true;
    });

    it('should handle numeric trace ID', () => {
      const span = {
        t: 123456789,
        s: 'fedcba0987654321',
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.traceId).to.equal('00000000000000000000000123456789');
    });

    it('should handle numeric span ID', () => {
      const span = {
        t: '1234567890abcdef',
        s: 987654321,
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.spanId).to.equal('0000000987654321');
      expect(result.spanId).to.have.lengthOf(16);
    });

    it('should handle numeric parent ID', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        p: 111222333,
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.parentSpanId).to.equal('0000000111222333');
      expect(result.parentSpanId).to.have.lengthOf(16);
    });

    it('should handle large timestamp values', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        ts: 9999999999999,
        d: 1000
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.startTimeUnixNano).to.equal('9999999999999000000');
      expect(result.endTimeUnixNano).to.equal('10000000000999000000');
    });

    it('should handle fractional timestamp values', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        ts: 1000.5,
        d: 10.5
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.startTimeUnixNano).to.equal('1000500000');
      expect(result.endTimeUnixNano).to.equal('1011000000');
    });

    it('should handle all fields being undefined except required ones', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321'
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result).to.have.property('traceId');
      expect(result).to.have.property('spanId');
      expect(result).to.have.property('name');
      expect(result).to.have.property('status');
      expect(result).to.have.property('kind');
      expect(result).to.have.property('endTimeUnixNano');
      expect(result).to.not.have.property('parentSpanId');
      expect(result).to.not.have.property('startTimeUnixNano');
    });

    it('should handle root span (no parent)', () => {
      const span = {
        t: '1234567890abcdef',
        s: 'fedcba0987654321',
        k: 1,
        ts: 1000,
        d: 10
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result).to.not.have.property('parentSpanId');
      expect(result).to.have.property('traceId');
      expect(result).to.have.property('spanId');
    });

    it('should preserve all metadata fields in correct format', () => {
      const span = {
        t: 'abc123def456',
        s: '123456789abc',
        p: 'parent123456',
        k: 2,
        ts: 1234567890,
        d: 999
      };

      const result = extractSpanMetadata(span, mockMapper);

      expect(result.traceId).to.be.a('string');
      expect(result.spanId).to.be.a('string');
      expect(result.parentSpanId).to.be.a('string');
      expect(result.kind).to.be.a('number');
      expect(result.startTimeUnixNano).to.be.a('string');
      expect(result.endTimeUnixNano).to.be.a('string');
      expect(result.name).to.be.a('string');
      expect(result.status).to.be.an('object');
    });
  });
});
