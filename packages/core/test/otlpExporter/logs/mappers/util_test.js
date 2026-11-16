/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { toBody, toSeverityText, toSeverityNumber } = require('../../../../src/otlpExporter/logs/mappers/util');

describe('otlpExporter/logs/mappers/util', () => {
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
      expect(toSeverityText(undefined)).to.equal(undefined);
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
      expect(toSeverityNumber('Warn')).to.equal(13);
      expect(toSeverityNumber('INFO')).to.equal(9);
    });

    it('should trim the level before the lookup', () => {
      expect(toSeverityNumber(' error ')).to.equal(17);
      expect(toSeverityNumber(' warn ')).to.equal(13);
    });

    it('should return undefined for an empty level', () => {
      expect(toSeverityNumber('')).to.equal(undefined);
      expect(toSeverityNumber('   ')).to.equal(undefined);
      expect(toSeverityNumber(undefined)).to.equal(undefined);
    });

    it('should return undefined for unknown levels (omit severityNumber)', () => {
      expect(toSeverityNumber('unknown')).to.equal(undefined);
      expect(toSeverityNumber('verbose')).to.equal(undefined);
      expect(toSeverityNumber('silly')).to.equal(undefined);
    });

    it('should not resolve inherited object properties', () => {
      expect(toSeverityNumber('constructor')).to.equal(undefined);
    });
  });
});
