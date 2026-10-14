/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const os = require('node:os');
const proxyquire = require('proxyquire');

const mockPackageJson = { version: '6.0.0' };

// Use proxyquire so the resource transformer picks up our fixed SDK version.
const resourceTransformer = proxyquire('../../../src/otlpExporter/common/transformers/resource', {
  '../../../../package.json': mockPackageJson
});

const { convert } = proxyquire('../../../src/otlpExporter/logs/converter', {
  './transformers': {
    ...require('../../../src/otlpExporter/logs/transformers'),
    resource: resourceTransformer
  }
});

const otlp = require('../../../src/otlpExporter');

// ─── helpers ─────────────────────────────────────────────────────────────────

function createLogSpan(overrides = {}) {
  return {
    t: 'b2cceaf591116691',
    s: '612e34ccffefed96',
    p: 'aabbccddeeff0011',
    ts: 1710000000000,
    n: 'log.pino',
    data: {
      log: {
        message: 'test message',
        level: 'info'
      }
    },
    f: { e: '1234', h: 'host-id-1' },
    ...overrides
  };
}

function getLogRecords(result) {
  return result.resourceLogs[0].scopeLogs[0].logRecords;
}

function getResourceAttributes(result) {
  return result.resourceLogs[0].resource.attributes;
}

function findAttribute(attributes, key) {
  return attributes.find(a => a.key === key);
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe('otlpExporter/logs/converter', () => {
  let hostnameStub;

  before(() => {
    otlp.init({
      serviceName: 'log-converter-test',
      logger: console,
      tracing: {
        otlp: {
          enabled: true,
          semConvVersion: '1.23'
        }
      }
    });

    hostnameStub = sinon.stub(os, 'hostname').returns('test.local');
  });

  after(() => {
    hostnameStub.restore();
  });

  // ─── null / empty cases ───────────────────────────────────────────────────

  describe('empty / non-log input', () => {
    it('returns null for an empty array', () => {
      expect(convert([])).to.be.null;
    });

    it('returns null for a non-array input', () => {
      expect(convert(null)).to.be.null;
    });

    it('returns null when no log spans are present', () => {
      const spans = [
        { t: 'abc', s: 'def', n: 'node.http.server', data: { http: {} } },
        { t: 'abc', s: 'ghi', n: 'postgres', data: { pg: {} } }
      ];
      expect(convert(spans)).to.be.null;
    });

    it('ignores non-log spans in a mixed batch', () => {
      const spans = [
        { t: 'abc', s: 'def', n: 'node.http.server', data: { http: {} } },
        createLogSpan()
      ];
      const result = convert(spans);
      expect(result).to.not.be.null;
      expect(getLogRecords(result)).to.have.length(1);
    });
  });

  // ─── OTLP structure ───────────────────────────────────────────────────────

  describe('OTLP structure', () => {
    it('wraps records in resourceLogs → scopeLogs → logRecords', () => {
      const result = convert([createLogSpan()]);
      expect(result).to.have.property('resourceLogs').that.is.an('array').with.length(1);
      expect(result.resourceLogs[0]).to.have.property('scopeLogs').that.is.an('array').with.length(1);
      expect(result.resourceLogs[0].scopeLogs[0]).to.have.property('logRecords').that.is.an('array').with.length(1);
    });

    it('includes scope name and version', () => {
      const result = convert([createLogSpan()]);
      const scope = result.resourceLogs[0].scopeLogs[0].scope;
      expect(scope).to.have.property('name');
      expect(scope).to.have.property('version');
    });

    it('converts multiple log spans into multiple logRecords', () => {
      const spans = [createLogSpan(), createLogSpan({ s: 'span-2', data: { log: { message: 'second', level: 'warn' } } })];
      const result = convert(spans);
      expect(getLogRecords(result)).to.have.length(2);
    });
  });

  // ─── resource attributes ──────────────────────────────────────────────────

  describe('resource attributes', () => {
    it('includes service.name', () => {
      const result = convert([createLogSpan()]);
      const attr = findAttribute(getResourceAttributes(result), 'service.name');
      expect(attr).to.exist;
      expect(attr.value).to.have.property('stringValue');
    });

    it('includes telemetry.sdk.language = nodejs', () => {
      const result = convert([createLogSpan()]);
      const attr = findAttribute(getResourceAttributes(result), 'telemetry.sdk.language');
      expect(attr.value.stringValue).to.equal('nodejs');
    });

    it('includes telemetry.sdk.name = instana', () => {
      const result = convert([createLogSpan()]);
      const attr = findAttribute(getResourceAttributes(result), 'telemetry.sdk.name');
      expect(attr.value.stringValue).to.equal('instana');
    });

    it('includes process.pid as intValue', () => {
      const result = convert([createLogSpan()]);
      const attr = findAttribute(getResourceAttributes(result), 'process.pid');
      expect(attr.value).to.have.property('intValue').that.is.a('number');
    });
  });

  // ─── logRecord fields ─────────────────────────────────────────────────────

  describe('logRecord fields', () => {
    it('sets timeUnixNano as nanoseconds string', () => {
      const result = convert([createLogSpan({ ts: 1710000000000 })]);
      expect(getLogRecords(result)[0].timeUnixNano).to.equal('1710000000000000000');
    });

    it('sets traceId zero-padded to 32 chars', () => {
      const result = convert([createLogSpan({ t: 'b2cceaf591116691' })]);
      expect(getLogRecords(result)[0].traceId).to.equal('0000000000000000b2cceaf591116691');
    });

    it('sets spanId from span.s (own ID)', () => {
      const result = convert([createLogSpan({ s: '612e34ccffefed96' })]);
      expect(getLogRecords(result)[0].spanId).to.equal('612e34ccffefed96');
    });

    it('does not set spanId equal to span.p', () => {
      const span = createLogSpan({ s: 'aaaa1111bbbb2222', p: 'cccc3333dddd4444' });
      const result = convert([span]);
      expect(getLogRecords(result)[0].spanId).to.equal('aaaa1111bbbb2222');
    });

    it('sets body as stringValue wrapper', () => {
      const result = convert([createLogSpan({ data: { log: { message: 'hello', level: 'info' } } })]);
      expect(getLogRecords(result)[0].body).to.deep.equal({ stringValue: 'hello' });
    });

    it('sets severityNumber = 9 for INFO', () => {
      const result = convert([createLogSpan({ data: { log: { message: 'x', level: 'info' } } })]);
      expect(getLogRecords(result)[0].severityNumber).to.equal(9);
    });

    it('sets severityText = INFO for info level', () => {
      const result = convert([createLogSpan({ data: { log: { message: 'x', level: 'info' } } })]);
      expect(getLogRecords(result)[0].severityText).to.equal('INFO');
    });

    it('sets severityNumber = 17 for ERROR', () => {
      const result = convert([createLogSpan({ data: { log: { message: 'boom', level: 'error' } } })]);
      expect(getLogRecords(result)[0].severityNumber).to.equal(17);
    });

    it('sets severityNumber = 21 for FATAL', () => {
      const result = convert([createLogSpan({ data: { log: { message: 'fatal', level: 'fatal' } } })]);
      expect(getLogRecords(result)[0].severityNumber).to.equal(21);
    });

    it('sets severityText = WARN for WARNING (normalised)', () => {
      const result = convert([createLogSpan({ data: { log: { message: 'x', level: 'WARNING' } } })]);
      expect(getLogRecords(result)[0].severityText).to.equal('WARN');
    });

    it('sets severityText = FATAL for CRITICAL (normalised)', () => {
      const result = convert([createLogSpan({ data: { log: { message: 'x', level: 'CRITICAL' } } })]);
      expect(getLogRecords(result)[0].severityText).to.equal('FATAL');
    });

    it('attributes is an array', () => {
      const result = convert([createLogSpan()]);
      expect(getLogRecords(result)[0].attributes).to.be.an('array');
    });
  });

  // ─── detection via span name ───────────────────────────────────────────────

  describe('log span detection by name', () => {
    it('picks up log.winston spans', () => {
      const span = { t: 'ttt', s: 'sss', n: 'log.winston', ts: 1000, data: { log: { message: 'w', level: 'info' } } };
      const result = convert([span]);
      expect(getLogRecords(result)).to.have.length(1);
    });

    it('picks up log.console spans', () => {
      const span = { t: 'ttt', s: 'sss', n: 'log.console', ts: 1000, data: { log: { message: 'c', level: 'error' } } };
      const result = convert([span]);
      expect(getLogRecords(result)[0].severityText).to.equal('ERROR');
    });
  });
});
