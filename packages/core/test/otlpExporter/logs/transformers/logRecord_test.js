/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { extractLogRecord } = require('../../../../src/otlpExporter/logs/transformers/logRecord');
const { logRecordMappings } = require('../../../../src/otlpExporter/logs/mappers');

describe('otlpExporter/logs/transformers/logRecord', () => {
  describe('extractLogRecord', () => {
    it('should extract all log record fields from a complete log span', () => {
      const span = {
        t: 'abc',
        s: 'ignored',
        p: 'def',
        ts: 1544712660300,
        n: 'log.pino',
        data: { log: { message: 'Example log record', level: 'warn' } }
      };

      expect(extractLogRecord(span, logRecordMappings)).to.deep.equal({
        timeUnixNano: '1544712660300000000',
        observedTimeUnixNano: '1544712660300000000',
        body: { stringValue: 'Example log record' },
        severityText: 'warn',
        severityNumber: 13,
        traceId: '00000000000000000000000000000abc',
        spanId: '0000000000000def',
        attributes: []
      });
    });

    it('should map an unknown level to severityNumber 0 and keep the original text', () => {
      const span = { t: '1', p: '2', ts: 1, data: { log: { message: 'x', level: 'Weird' } } };
      const record = extractLogRecord(span, logRecordMappings);

      expect(record.severityText).to.equal('Weird');
      expect(record.severityNumber).to.equal(0);
    });

    it('should omit severity fields for an empty level', () => {
      const span = { t: '1', p: '2', ts: 1, data: { log: { message: 'x', level: '' } } };
      const record = extractLogRecord(span, logRecordMappings);

      expect(record).to.not.have.property('severityText');
      expect(record).to.not.have.property('severityNumber');
    });

    it('should omit fields whose source value is missing', () => {
      const record = extractLogRecord({ data: { log: {} } }, logRecordMappings);

      expect(record).to.deep.equal({ attributes: [] });
    });

    it('should omit fields when there is no data', () => {
      const record = extractLogRecord({ t: 't1', p: 'p1' }, logRecordMappings);

      expect(record).to.not.have.property('body');
      expect(record).to.not.have.property('severityText');
      expect(record).to.not.have.property('severityNumber');
      expect(record).to.have.property('traceId');
      expect(record).to.have.property('spanId');
    });

    it('should apply custom mappings', () => {
      const record = extractLogRecord({ data: { log: { message: 'm' } } }, [
        { otlp: 'custom', instana: 'data.log.message', transform: value => value.toUpperCase() },
        { otlp: 'static', value: 'v' }
      ]);

      expect(record).to.deep.equal({ custom: 'M', static: 'v' });
    });
  });
});
