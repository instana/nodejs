/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const os = require('node:os');
const proxyquire = require('proxyquire');

const mockPackageJson = { version: '6.0.0' };

function loadResource() {
  return proxyquire('../../../../src/otlpExporter/common/transformers/resource', {
    '../../../../package.json': Object.assign({ '@noCallThru': true }, mockPackageJson)
  });
}

const ctx = require('../../../../src/otlpExporter/common/context');
const otlp = require('../../../../src/otlpExporter');

const INIT_CONFIG = {
  serviceName: 'resource-test-service',
  logger: console,
  tracing: { otlp: { enabled: true, semConvVersion: '1.23' } }
};

const resource = loadResource();

function extract(span) {
  return resource.extractResourceAttributes(span).attributes;
}

function find(attrs, key) {
  return attrs.find(a => a.key === key);
}

function expectStr(attrs, key, value) {
  expect(find(attrs, key), `Missing attribute "${key}"`).to.deep.equal({
    key,
    value: { stringValue: value }
  });
}

function expectInt(attrs, key, value) {
  expect(find(attrs, key), `Missing attribute "${key}"`).to.deep.equal({
    key,
    value: { intValue: value }
  });
}

function expectAbsent(attrs, key) {
  expect(find(attrs, key), `Attribute "${key}" should be absent`).to.be.undefined;
}

function makeSpan(overrides = {}) {
  return {
    f: { e: '1234', h: 'default-host-id', ...(overrides.f || {}) },
    data: { ...(overrides.data || {}) }
  };
}

describe('otlpExporter/common/transformers/resource', () => {
  let hostnameStub;

  before(() => {
    hostnameStub = sinon.stub(os, 'hostname').returns('stub.hostname.test');
    otlp.init(INIT_CONFIG);
  });

  after(() => {
    hostnameStub.restore();
    ctx._config = null;
    ctx._semConvVersion = null;
    ctx._compiledSemConv = null;
    ctx._pid = null;
    ctx._serviceName = null;
    ctx._serviceVersion = null;
  });

  describe('extractResourceAttributes', () => {
    it('returns empty attributes for a null payload', () => {
      expect(resource.extractResourceAttributes(null)).to.deep.equal({ attributes: [] });
    });

    it('returns empty attributes for an undefined payload', () => {
      expect(resource.extractResourceAttributes(undefined)).to.deep.equal({ attributes: [] });
    });
  });

  describe('INSTRUMENTATION_SCOPE', () => {
    it('exposes name and version', () => {
      expect(resource.INSTRUMENTATION_SCOPE).to.deep.equal({
        name: '@instana/collector',
        version: '6.0.0'
      });
    });
  });

  describe('service.name', () => {
    it('uses resource["service.name"] from span data', () => {
      const span = makeSpan({ data: { resource: { 'service.name': 'from-span-data' } } });
      expectStr(extract(span), 'service.name', 'from-span-data');
    });

    it('uses ctx.serviceName set by otlp.init', () => {
      expectStr(extract(makeSpan()), 'service.name', 'resource-test-service');
    });
  });

  describe('telemetry.sdk.*', () => {
    it('emits hardcoded sdk.language "nodejs"', () => {
      expectStr(extract(makeSpan()), 'telemetry.sdk.language', 'nodejs');
    });

    it('emits hardcoded sdk.name "instana"', () => {
      expectStr(extract(makeSpan()), 'telemetry.sdk.name', 'instana');
    });

    it('emits sdk.version from package.json (mocked to 6.0.0)', () => {
      expectStr(extract(makeSpan()), 'telemetry.sdk.version', '6.0.0');
    });

    it('allows span data to override sdk.language', () => {
      const span = makeSpan({ data: { resource: { 'telemetry.sdk.language': 'python' } } });
      expectStr(extract(span), 'telemetry.sdk.language', 'python');
    });

    it('allows span data to override sdk.name', () => {
      const span = makeSpan({ data: { resource: { 'telemetry.sdk.name': 'opentelemetry' } } });
      expectStr(extract(span), 'telemetry.sdk.name', 'opentelemetry');
    });

    it('allows span data to override sdk.version', () => {
      const span = makeSpan({ data: { resource: { 'telemetry.sdk.version': '99.0.0' } } });
      expectStr(extract(span), 'telemetry.sdk.version', '99.0.0');
    });
  });

  describe('process.pid', () => {
    it('uses metadata f.e field as pid', () => {
      const span = makeSpan({ f: { e: '9999', h: 'h' } });
      expectInt(extract(span), 'process.pid', 9999);
    });

    it('uses resource["process.pid"] from span data', () => {
      const span = makeSpan({ data: { resource: { 'process.pid': 1234 } } });
      expectInt(extract(span), 'process.pid', 1234);
    });

    it('omits process.pid for non-numeric values', () => {
      const span = { f: { e: 'not-a-number' }, data: {} };
      expectAbsent(extract(span), 'process.pid');
    });
  });

  describe('os.type', () => {
    let platformStub;

    beforeEach(() => {
      platformStub = sinon.stub(process, 'platform').value('linux');
    });

    afterEach(() => {
      if (platformStub) {
        platformStub.restore();
        platformStub = null;
      }
    });

    function stubPlatform(value) {
      platformStub.value(value);
    }

    it('uses resource["os.type"] from span data, overriding process.platform', () => {
      stubPlatform('linux');
      const span = makeSpan({ data: { resource: { 'os.type': 'windows' } } });
      expectStr(extract(span), 'os.type', 'windows');
    });

    it('maps win32 → "windows"', () => {
      stubPlatform('win32');
      expectStr(extract(makeSpan()), 'os.type', 'windows');
    });

    it('passes unknown platforms through as-is', () => {
      stubPlatform('freebsd');
      expectStr(extract(makeSpan()), 'os.type', 'freebsd');
    });
  });

  describe('host.name', () => {
    it('uses resource["host.name"] from span data', () => {
      const span = makeSpan({ data: { resource: { 'host.name': 'custom-host.example' } } });
      expectStr(extract(span), 'host.name', 'custom-host.example');
    });

    it('falls back to os.hostname() when not in span data', () => {
      expectStr(extract(makeSpan()), 'host.name', 'stub.hostname.test');
    });
  });

  describe('required attributes always present', () => {
    it('emits all required attributes on every span', () => {
      const attrs = extract(makeSpan());
      const required = [
        'service.name',
        'telemetry.sdk.language',
        'telemetry.sdk.name',
        'telemetry.sdk.version',
        'process.pid',
        'os.type'
      ];
      required.forEach(key => {
        expect(find(attrs, key), `Required attribute "${key}" must be present`).to.exist;
      });
    });
  });
});
