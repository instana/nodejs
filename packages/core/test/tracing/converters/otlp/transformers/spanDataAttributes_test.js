/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');
const { extractSpanDataAttributes } = require('../../../../../src/tracing/converters/otlp/transformers/dataAttributes');

describe('tracing/converters/otlp/transformers/spanDataAttributes', () => {
  function loadFixture(filename) {
    const fixturePath = path.join(__dirname, 'fixtures', filename);
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  }

  describe.only('extractSpanDataAttributes', () => {
    describe('JSON Fixture Tests - Complete Span Data Transformations', () => {
      it('should transform HTTP span data from JSON fixture correctly', () => {
        const input = loadFixture('./input/http.json');
        const expectedOutput = loadFixture('./output/dataAttributes/http.json');

        const result = extractSpanDataAttributes(input);
        expect(result).to.be.an('array');
        expect(result).to.have.lengthOf(expectedOutput.length);

        expectedOutput.forEach(expectedAttr => {
          const actualAttr = result.find(attr => attr.key === expectedAttr.key);
          expect(actualAttr, `Missing attribute: ${expectedAttr.key}`).to.exist;
          expect(actualAttr.value).to.deep.equal(expectedAttr.value);
        });
      });

      it('should transform Kafka span data with peer from JSON fixture correctly', () => {
        const input = loadFixture('./input/kafka.json');
        const expectedOutput = loadFixture('./output/dataAttributes/kafka.json');

        const result = extractSpanDataAttributes(input);

        expect(result).to.be.an('array');
        expect(result.length).to.be.at.least(expectedOutput.length);

        expectedOutput.forEach(expectedAttr => {
          const actualAttr = result.find(
            attr => attr.key === expectedAttr.key && JSON.stringify(attr.value) === JSON.stringify(expectedAttr.value)
          );
          expect(actualAttr, `Missing or incorrect attribute: ${expectedAttr.key}`).to.exist;
        });
      });

      it('should transform MongoDB span data with peer from JSON fixture correctly', () => {
        const input = loadFixture('./input/mongodb.json');
        const expectedOutput = loadFixture('./output/dataAttributes/mongodb.json');
        const result = extractSpanDataAttributes(input);

        expect(result).to.be.an('array');
        expect(result).to.have.lengthOf(expectedOutput.length);

        expectedOutput.forEach(expectedAttr => {
          const actualAttr = result.find(attr => attr.key === expectedAttr.key);
          expect(actualAttr, `Missing attribute: ${expectedAttr.key}`).to.exist;
          expect(actualAttr.value).to.deep.equal(expectedAttr.value);
        });
      });

      it('should transform PostgreSQL span data from JSON fixture correctly', () => {
        const input = loadFixture('./input/postgresql.json');
        const expectedOutput = loadFixture('./output/dataAttributes/postgresql.json');

        const result = extractSpanDataAttributes(input);

        expect(result).to.be.an('array');
        expect(result).to.have.lengthOf(expectedOutput.length);

        expectedOutput.forEach(expectedAttr => {
          const actualAttr = result.find(attr => attr.key === expectedAttr.key);
          expect(actualAttr, `Missing attribute: ${expectedAttr.key}`).to.exist;
          expect(actualAttr.value).to.deep.equal(expectedAttr.value);
        });
      });
    });
  });
});
