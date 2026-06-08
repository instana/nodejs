/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');
const { convert } = require('../../../../src/tracing/converters/otlp/converter');

describe('tracing/converters/otlp/converter', () => {
  // Helper function to load JSON fixtures
  function loadFixture(filename) {
    const fixturePath = path.join(__dirname, 'fixtures', filename);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  describe.only('convert', () => {
    describe('JSON Fixture Tests - Complete Conversion', () => {
      it('should convert single HTTP span from JSON fixture correctly', () => {
        const input = [loadFixture('input-single-http.json')];
        const expectedOutput = loadFixture('output-single-http.json');

        const result = convert(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('should convert single otel span from JSON fixture correctly', () => {
        const input = [loadFixture('otel.json')];
        const expectedOutput = loadFixture('output-otel.json');

        const result = convert(input);
        console.log(JSON.stringify(result));

        expect(result).to.deep.equal(expectedOutput);
      });

      it.skip('should convert multiple spans with same resource from JSON fixture correctly', () => {
        const input = loadFixture('converter-input-multiple-same-resource.json');
        const expectedOutput = loadFixture('converter-output-multiple-same-resource.json');

        const result = convert(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it.skip('should convert multiple spans with different resources from JSON fixture correctly', () => {
        const input = loadFixture('converter-input-multiple-different-resources.json');
        const expectedOutput = loadFixture('converter-output-multiple-different-resources.json');

        const result = convert(input);

        expect(result).to.deep.equal(expectedOutput);
      });
    });
  });
});
