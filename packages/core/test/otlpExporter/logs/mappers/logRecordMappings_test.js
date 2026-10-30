/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { logRecordMappings } = require('../../../../src/otlpExporter/logs/mappers');

describe('otlpExporter/logs/mappers/logRecordMappings', () => {
  function find(otlp) {
    return logRecordMappings.filter(mapping => mapping.otlp === otlp);
  }

  it('should define a mapping for every OTLP log record field', () => {
    const fields = logRecordMappings.map(mapping => mapping.otlp);
    expect(fields).to.have.members([
      'timeUnixNano',
      'observedTimeUnixNano',
      'body',
      'severityText',
      'severityNumber',
      'traceId',
      'spanId',
      'attributes'
    ]);
  });

  it('should map ts to timeUnixNano and observedTimeUnixNano', () => {
    expect(find('timeUnixNano')[0].instana).to.equal('ts');
    expect(find('observedTimeUnixNano')[0].instana).to.equal('ts');
  });

  it('should map data.log.message to body', () => {
    expect(find('body')[0].instana).to.equal('data.log.message');
  });

  it('should map data.log.level to severityText and severityNumber', () => {
    expect(find('severityText')[0].instana).to.equal('data.log.level');
    expect(find('severityNumber')[0].instana).to.equal('data.log.level');
  });

  it('should map t to traceId and the parent span p to spanId', () => {
    expect(find('traceId')[0].instana).to.equal('t');
    expect(find('spanId')[0].instana).to.equal('p');
  });

  it('should provide an empty attributes list', () => {
    const attributes = find('attributes')[0];
    expect(attributes.instana).to.equal(undefined);
    expect(attributes.value).to.deep.equal([]);
  });
});
