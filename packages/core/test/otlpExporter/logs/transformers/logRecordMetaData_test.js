/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const otlp = require('../../../../src/otlpExporter');
const { extractLogRecordMetadata } = require('../../../../src/otlpExporter/logs/transformers/logRecordMetaData');
const mapper = require('../../../../src/otlpExporter/logs/mappers');

describe('otlpExporter/logs/transformers/logRecordMetaData', () => {
  before(() => {
    otlp.init({
      serviceName: 'otel-exporter-test',
      logger: console,
      tracing: {
        otlp: {
          enabled: true,
          semConvVersion: '1.23'
        }
      }
    });
  });

  function createLogSpan(overrides = {}) {
    return {
      t: 'b2cceaf591116691',
      s: '612e34ccffefed96',
      p: 'aabbccddeeff0011',
      ts: 1710000000000,
      n: 'log.pino',
      data: {
        log: {
          message: 'something happened',
          level: 'info'
        }
      },
      ...overrides
    };
  }

  it('emits timeUnixNano in nanoseconds', () => {
    const result = extractLogRecordMetadata(createLogSpan(), mapper);
    expect(result.timeUnixNano).to.equal('1710000000000000000');
  });

  it('emits severityNumber', () => {
    const result = extractLogRecordMetadata(createLogSpan(), mapper);
    expect(result.severityNumber).to.equal(9); // INFO
  });

  it('emits severityText', () => {
    const result = extractLogRecordMetadata(createLogSpan(), mapper);
    expect(result.severityText).to.equal('INFO');
  });

  it('emits body as a stringValue wrapper', () => {
    const result = extractLogRecordMetadata(createLogSpan(), mapper);
    expect(result.body).to.deep.equal({ stringValue: 'something happened' });
  });

  it('emits traceId zero-padded to 32 chars', () => {
    const result = extractLogRecordMetadata(createLogSpan(), mapper);
    expect(result.traceId).to.equal('0000000000000000b2cceaf591116691');
  });

  it('emits spanId from span.s (own ID), not span.p', () => {
    const result = extractLogRecordMetadata(createLogSpan(), mapper);
    expect(result.spanId).to.equal('612e34ccffefed96');
  });

  it('does not set fields whose value is undefined', () => {
    const span = createLogSpan({ ts: undefined });
    const result = extractLogRecordMetadata(span, mapper);
    expect(result).to.not.have.property('timeUnixNano');
  });

  it('handles ERROR level correctly', () => {
    const span = createLogSpan({ data: { log: { message: 'boom', level: 'error' } } });
    const result = extractLogRecordMetadata(span, mapper);
    expect(result.severityNumber).to.equal(17);
    expect(result.severityText).to.equal('ERROR');
  });

  it('handles WARN level correctly', () => {
    const span = createLogSpan({ data: { log: { message: 'careful', level: 'warn' } } });
    const result = extractLogRecordMetadata(span, mapper);
    expect(result.severityNumber).to.equal(13);
    expect(result.severityText).to.equal('WARN');
  });

  it('falls back to ec for severity when level is absent', () => {
    const span = createLogSpan({ data: { log: { message: 'no level' } }, ec: 1 });
    const result = extractLogRecordMetadata(span, mapper);
    expect(result.severityNumber).to.equal(17); // ERROR
    expect(result.severityText).to.equal('ERROR');
  });
});
