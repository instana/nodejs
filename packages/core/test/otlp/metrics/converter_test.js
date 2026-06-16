/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');

const converter = require('../../../src/otlp/metrics');

describe('metrics/converters/otlp', () => {
  function loadInputFixture(filename) {
    const fixturePath = path.join(__dirname, 'fixtures/input', filename);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  function loadOutputFixture(filename) {
    const fixturePath = path.join(__dirname, 'fixtures/output', filename);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  beforeEach(() => {
    converter.setHostId(null);
    converter.setPid(null);
  });

  describe('converter', () => {
    describe('basic conversion', () => {
      it('should convert array of metrics to OTLP format', () => {
        const input = loadInputFixture('simple-metrics.json');
        const expectedOutput = loadOutputFixture('simple-metrics-output.json');

        const result = converter.transform(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('should return empty resourceMetrics for empty input', () => {
        const result = converter.transform([]);
        expect(result).to.deep.equal({ resourceMetrics: [] });
      });

      it('should return empty resourceMetrics for null input', () => {
        const result = converter.transform(null);
        expect(result).to.deep.equal({ resourceMetrics: [] });
      });

      it('should return empty resourceMetrics for undefined input', () => {
        const result = converter.transform(undefined);
        expect(result).to.deep.equal({ resourceMetrics: [] });
      });
    });
  });
});
