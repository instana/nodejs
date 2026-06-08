/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const {
  extractMetaDataAttributes
} = require('../../../../../src/tracing/converters/otlp/transformers/metaDataAttributes');

const fs = require('fs');
const path = require('path');

function loadFixture(filename) {
  const fixturePath = path.join(__dirname, 'fixtures', filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

describe('tracing/converters/otlp/transformers/metaAttributes', () => {
  describe('JSON Fixture Tests - Complete Span Transformations', () => {
    it('should transform HTTP server span from JSON fixture correctly', () => {
      const input = loadFixture('spandata-input-http.json');
      const expectedOutput = loadFixture('output-http-server-span.json');

      const result = extractMetaDataAttributes(input);

      expect(result).to.deep.equal(expectedOutput);
    });

    it('should transform Kafka producer span from JSON fixture correctly', () => {
      const input = loadFixture('spandata-input-kafka.json');
      const expectedOutput = loadFixture('output-kafka-producer-span.json');

      const result = extractMetaDataAttributes(input);

      expect(result).to.deep.equal(expectedOutput);
    });

    it('should transform MongoDB error span from JSON fixture correctly', () => {
      const input = loadFixture('spandata-input-mongodb.json');
      const expectedOutput = loadFixture('output-mongodb-error-span.json');

      const result = extractMetaDataAttributes(input);

      expect(result).to.deep.equal(expectedOutput);
    });
  });
});
