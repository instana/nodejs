/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const {
  OTEL_SPAN_NAME,
  isOtelSpan,
  spanName,
  spanAttributes,
  spanStatus
} = require('../../../../src/otlpExporter/traces/mappers/otelInstrumentationMappings');
const { OTLP_STATUS_CODES } = require('../../../../src/otlpExporter/traces/mappers/constants');

describe('otlpExporter/traces/mappers/otelInstrumentationMappings', () => {
  describe('OTEL_SPAN_NAME', () => {
    it('should export the correct constant', () => {
      expect(OTEL_SPAN_NAME).to.equal('otel');
    });
  });

  describe('isOtelSpan', () => {
    it('should return true for otel spans', () => {
      const span = {
        n: 'otel'
      };

      expect(isOtelSpan(span)).to.be.true;
    });

    it('should return false for non-otel spans', () => {
      const span = {
        n: 'node.http.server'
      };

      expect(isOtelSpan(span)).to.be.false;
    });

    it('should return false for spans without name', () => {
      const span = {
        data: {}
      };

      expect(isOtelSpan(span)).to.be.false;
    });
  });

  describe('spanName', () => {
    it('should return span name when present', () => {
      const span = {
        n: 'otel'
      };

      const result = spanName(span);
      expect(result).to.equal('otel');
    });

    it('should return custom span name', () => {
      const span = {
        n: 'custom.operation'
      };

      const result = spanName(span);
      expect(result).to.equal('custom.operation');
    });

    it('should return "unknown" when span has no name', () => {
      const span = {
        data: {}
      };

      const result = spanName(span);
      expect(result).to.equal('unknown');
    });
  });

  describe('spanAttributes', () => {
    it('should extract tags as attributes', () => {
      const span = {
        n: 'otel',
        data: {
          tags: {
            'http.method': 'GET',
            'http.url': 'https://example.com/api',
            'http.status_code': 200
          }
        }
      };

      const result = spanAttributes(span);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(3);
      expect(result).to.deep.include({
        key: 'http.method',
        value: { stringValue: 'GET' }
      });
      expect(result).to.deep.include({
        key: 'http.url',
        value: { stringValue: 'https://example.com/api' }
      });
      expect(result).to.deep.include({
        key: 'http.status_code',
        value: { intValue: 200 }
      });
    });

    it('should handle tags with different value types', () => {
      const span = {
        n: 'otel',
        data: {
          tags: {
            stringTag: 'value',
            intTag: 42,
            floatTag: 3.14,
            boolTag: true,
            objectTag: { nested: 'value' }
          }
        }
      };

      const result = spanAttributes(span);

      expect(result).to.deep.include({
        key: 'stringTag',
        value: { stringValue: 'value' }
      });
      expect(result).to.deep.include({
        key: 'intTag',
        value: { intValue: 42 }
      });
      expect(result).to.deep.include({
        key: 'floatTag',
        value: { doubleValue: 3.14 }
      });
      expect(result).to.deep.include({
        key: 'boolTag',
        value: { boolValue: true }
      });
      expect(result).to.deep.include({
        key: 'objectTag',
        value: { stringValue: '{"nested":"value"}' }
      });
    });

    it('should extract operation attributes', () => {
      const span = {
        n: 'otel',
        data: {
          operation: 'custom.operation'
        }
      };

      const result = spanAttributes(span);

      expect(result).to.deep.include({
        key: 'operation',
        value: { stringValue: 'custom.operation' }
      });
    });

    it('should handle both tags and operation', () => {
      const span = {
        n: 'otel',
        data: {
          tags: {
            'custom.tag': 'value'
          },
          operation: 'my.operation'
        }
      };

      const result = spanAttributes(span);

      expect(result).to.have.lengthOf(2);
      expect(result).to.deep.include({
        key: 'custom.tag',
        value: { stringValue: 'value' }
      });
      expect(result).to.deep.include({
        key: 'operation',
        value: { stringValue: 'my.operation' }
      });
    });

    it('should skip resource span type', () => {
      const span = {
        n: 'otel',
        data: {
          tags: {
            'custom.tag': 'value'
          },
          resource: {
            someData: 'should be ignored'
          }
        }
      };

      const result = spanAttributes(span);

      expect(result).to.have.lengthOf(1);
      expect(result).to.deep.include({
        key: 'custom.tag',
        value: { stringValue: 'value' }
      });
      // Should not have any resource attributes
      expect(result.every(attr => !attr.key.includes('resource'))).to.be.true;
    });

    it('should return empty array for span with no data', () => {
      const span = {
        n: 'otel',
        data: {}
      };

      const result = spanAttributes(span);
      expect(result).to.deep.equal([]);
    });

    it('should return empty array for span with null data', () => {
      const span = {
        n: 'otel',
        data: null
      };

      const result = spanAttributes(span);
      expect(result).to.deep.equal([]);
    });

    it('should return empty array for span with undefined data', () => {
      const span = {
        n: 'otel'
      };

      const result = spanAttributes(span);
      expect(result).to.deep.equal([]);
    });

    it('should handle empty tags object', () => {
      const span = {
        n: 'otel',
        data: {
          tags: {}
        }
      };

      const result = spanAttributes(span);
      expect(result).to.deep.equal([]);
    });

    it('should handle null tags', () => {
      const span = {
        n: 'otel',
        data: {
          tags: null
        }
      };

      const result = spanAttributes(span);
      expect(result).to.deep.equal([]);
    });

    it('should handle null operation', () => {
      const span = {
        n: 'otel',
        data: {
          operation: null
        }
      };

      const result = spanAttributes(span);
      expect(result).to.deep.equal([]);
    });

    it('should handle undefined operation', () => {
      const span = {
        n: 'otel',
        data: {
          operation: undefined
        }
      };

      const result = spanAttributes(span);
      expect(result).to.deep.equal([]);
    });

    it('should handle tags with null values', () => {
      const span = {
        n: 'otel',
        data: {
          tags: {
            'valid.tag': 'value',
            'null.tag': null,
            'undefined.tag': undefined
          }
        }
      };

      const result = spanAttributes(span);

      // Should include all tags, even with null/undefined values
      // formatOTLPValue converts them to strings
      expect(result).to.have.lengthOf(3);
      expect(result).to.deep.include({
        key: 'valid.tag',
        value: { stringValue: 'value' }
      });
    });

    it('should handle multiple span types excluding resource', () => {
      const span = {
        n: 'otel',
        data: {
          tags: {
            tag1: 'value1'
          },
          operation: 'op1',
          resource: {
            ignored: 'data'
          },
          unknownType: {
            data: 'value'
          }
        }
      };

      const result = spanAttributes(span);

      // Should have tags and operation, but not resource or unknownType (no handler)
      expect(result.some(attr => attr.key === 'tag1')).to.be.true;
      expect(result.some(attr => attr.key === 'operation')).to.be.true;
      expect(result.every(attr => !attr.key.includes('resource'))).to.be.true;
      expect(result.every(attr => !attr.key.includes('unknownType'))).to.be.true;
    });

    it('should handle tags with special characters in keys', () => {
      const span = {
        n: 'otel',
        data: {
          tags: {
            'http.request.method': 'GET',
            'db.system': 'postgresql',
            'messaging.destination.name': 'my-queue'
          }
        }
      };

      const result = spanAttributes(span);

      expect(result).to.have.lengthOf(3);
      expect(result).to.deep.include({
        key: 'http.request.method',
        value: { stringValue: 'GET' }
      });
      expect(result).to.deep.include({
        key: 'db.system',
        value: { stringValue: 'postgresql' }
      });
      expect(result).to.deep.include({
        key: 'messaging.destination.name',
        value: { stringValue: 'my-queue' }
      });
    });
  });

  describe('spanStatus', () => {
    it('should return UNSET status when span has no error', () => {
      const span = {
        n: 'otel',
        data: {
          tags: {
            'http.status_code': 200
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.UNSET
      });
    });

    it('should return ERROR status when span.ec is set', () => {
      const span = {
        n: 'otel',
        ec: 1,
        data: {
          tags: {
            error: 'Something went wrong'
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: 'Something went wrong'
      });
    });

    it('should return ERROR status with span name when no error tag', () => {
      const span = {
        n: 'otel',
        ec: 1,
        data: {
          tags: {}
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: 'otel failed'
      });
    });

    it('should return ERROR status with "operation failed" when no span name', () => {
      const span = {
        ec: 1,
        data: {
          tags: {}
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: 'operation failed'
      });
    });

    it('should handle ec as truthy value', () => {
      const span = {
        n: 'otel',
        ec: 5,
        data: {
          tags: {
            error: 'Multiple errors'
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: 'Multiple errors'
      });
    });

    it('should return UNSET when ec is 0', () => {
      const span = {
        n: 'otel',
        ec: 0,
        data: {
          tags: {}
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.UNSET
      });
    });

    it('should return UNSET when ec is false', () => {
      const span = {
        n: 'otel',
        ec: false,
        data: {
          tags: {}
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.UNSET
      });
    });

    it('should return UNSET when ec is null', () => {
      const span = {
        n: 'otel',
        ec: null,
        data: {
          tags: {}
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.UNSET
      });
    });

    it('should return UNSET when ec is undefined', () => {
      const span = {
        n: 'otel',
        data: {
          tags: {}
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.UNSET
      });
    });

    it('should handle missing data object', () => {
      const span = {
        n: 'otel',
        ec: 1
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: 'otel failed'
      });
    });

    it('should handle missing tags in data', () => {
      const span = {
        n: 'otel',
        ec: 1,
        data: {}
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: 'otel failed'
      });
    });

    it('should handle null span', () => {
      const result = spanStatus(null);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.UNSET
      });
    });

    it('should handle undefined span', () => {
      const result = spanStatus(undefined);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.UNSET
      });
    });

    it('should convert error tag to string', () => {
      const span = {
        n: 'otel',
        ec: 1,
        data: {
          tags: {
            error: 12345
          }
        }
      };

      const result = spanStatus(span);

      expect(result).to.deep.equal({
        code: OTLP_STATUS_CODES.ERROR,
        message: '12345'
      });
    });
  });
});
