/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const { extractSpanMetadata } = require('../../../../../src/tracing/converters/otlp/transformers/spanMetaData');

const fs = require('fs');
const path = require('path');

function loadFixture(filename) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

describe.only('tracing/converters/otlp/transformers/metaAttributes', () => {
  describe('JSON Fixture Tests - Complete Span Transformations', () => {
    it('should transform HTTP server span from JSON fixture correctly', () => {
      const input = loadFixture('./input/http.json');
      const expectedOutput = loadFixture('./output/metaData/http.json');

      const result = extractSpanMetadata(input);

      expect(result).to.deep.equal(expectedOutput);
    });

    it('should transform Kafka producer span from JSON fixture correctly', () => {
      const input = loadFixture('./input/kafka.json');
      const expectedOutput = loadFixture('./output/metaData/kafka.json');

      const result = extractSpanMetadata(input);

      expect(result).to.deep.equal(expectedOutput);
    });

    it('should transform MongoDB error span from JSON fixture correctly', () => {
      const input = loadFixture('./input/mongodb.json');
      const expectedOutput = loadFixture('./output/metaData/mongodb.json');

      const result = extractSpanMetadata(input);

      expect(result).to.deep.equal(expectedOutput);
    });

    it('should transform otel  span from JSON fixture correctly', () => {
      const input = loadFixture('./input/otel.json');
      const expectedOutput = loadFixture('./output/metaData/otel.json');

      const result = extractSpanMetadata(input);

      expect(result).to.deep.equal(expectedOutput);
    });
  });
});
