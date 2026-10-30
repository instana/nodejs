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

const realTransformers = require('../../../src/otlpExporter/metrics/transformers');

const converterModule = proxyquire('../../../src/otlpExporter/metrics/converter', {
  './transformers': {
    ...realTransformers,
    resource: resourceTransformer
  }
});

const converter = proxyquire('../../../src/otlpExporter/metrics', {
  './converter': converterModule
});

function loadInputFixture(filename) {
  const fixturePath = path.join(__dirname, 'fixtures/input', filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function loadOutputFixture(filename) {
  const fixturePath = path.join(__dirname, 'fixtures/output', filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function getResourceAttributes(result) {
  return result.resourceMetrics[0].resource.attributes;
}

function findAttribute(attributes, key) {
  return attributes.find(a => a.key === key);
}

describe('metrics/converters/otlp', () => {
  let hostnameStub;
  let platformStub;

  before(() => {
    hostnameStub = sinon.stub(os, 'hostname').returns('test-hostname');
    platformStub = sinon.stub(process, 'platform').value('linux');
  });

  after(() => {
    hostnameStub.restore();
    platformStub.restore();
  });

  describe('converter', () => {
    describe('basic conversion', () => {
      it('converts a full metrics payload to OTLP format', () => {
        const input = loadInputFixture('metrics.json');
        const expectedOutput = loadOutputFixture('metrics-output.json');

        const result = converter.transform(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('includes expected resource attributes', () => {
        const input = loadInputFixture('metrics.json');
        const result = converter.transform(input);

        const attrs = getResourceAttributes(result);
        expect(findAttribute(attrs, 'service.name')).to.deep.equal({
          key: 'service.name',
          value: { stringValue: 'otel-exporter-test' }
        });
        expect(findAttribute(attrs, 'telemetry.sdk.language')).to.deep.equal({
          key: 'telemetry.sdk.language',
          value: { stringValue: 'nodejs' }
        });
        expect(findAttribute(attrs, 'telemetry.sdk.name')).to.deep.equal({
          key: 'telemetry.sdk.name',
          value: { stringValue: 'instana' }
        });
        expect(findAttribute(attrs, 'telemetry.sdk.version')).to.deep.equal({
          key: 'telemetry.sdk.version',
          value: { stringValue: '6.0.0' }
        });
        expect(findAttribute(attrs, 'host.name')).to.deep.equal({
          key: 'host.name',
          value: { stringValue: 'test-hostname' }
        });
        expect(findAttribute(attrs, 'os.type')).to.deep.equal({
          key: 'os.type',
          value: { stringValue: 'linux' }
        });
      });

      it('returns empty resourceMetrics for null', () => {
        expect(converter.transform(null)).to.deep.equal({ resourceMetrics: [] });
      });

      it('returns empty resourceMetrics for undefined', () => {
        expect(converter.transform(undefined)).to.deep.equal({ resourceMetrics: [] });
      });

      it('returns empty resourceMetrics and logs when an internal error is thrown', () => {
        const debugSpy = sinon.spy();
        converterModule.init({ logger: { debug: debugSpy } });

        const badPayload = Object.create(null);
        Object.defineProperty(badPayload, 'timestamp', {
          get() {
            throw new Error('boom');
          }
        });

        const result = converterModule.convert(badPayload);

        expect(result).to.deep.equal({ resourceMetrics: [] });
        expect(debugSpy.calledOnce).to.be.true;
        expect(debugSpy.firstCall.args[0]).to.equal('Failed to convert metrics to OTLP format.');

        converterModule.init({ logger: null });
      });
    });
  });
});
