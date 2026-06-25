/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const fs = require('node:fs');
const path = require('node:path');
const sinon = require('sinon');
const os = require('os');
const proxyquire = require('proxyquire');

const mockPackageJson = { version: '6.0.0' };

const resourceTransformer = proxyquire('../../../src/otlpExporter/common/transformers/resource', {
  '../../../../package.json': mockPackageJson
});

const converter = proxyquire('../../../src/otlpExporter/metrics', {
  './converter': proxyquire('../../../src/otlpExporter/metrics/converter', {
    './transformers': {
      resource: resourceTransformer
    }
  })
});

function loadInputFixture(filename) {
  const fixturePath = path.join(__dirname, 'fixtures/input', filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function loadOutputFixture(filename) {
  const fixturePath = path.join(__dirname, 'fixtures/output', filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

describe('metrics/converters/otlp', () => {
  let hostnameStub;

  before(() => {
    hostnameStub = sinon.stub(os, 'hostname').returns('test-hostname');
  });

  after(() => {
    hostnameStub.restore();
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
