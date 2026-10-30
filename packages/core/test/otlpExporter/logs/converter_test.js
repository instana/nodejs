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

const realTransformers = require('../../../src/otlpExporter/logs/transformers');

const converterModule = proxyquire('../../../src/otlpExporter/logs/converter', {
  './transformers': {
    ...realTransformers,
    resource: resourceTransformer
  }
});

const converter = proxyquire('../../../src/otlpExporter/logs', {
  './converter': converterModule
});

const otlpCtx = require('../../../src/otlpExporter/common/context');

function loadInputFixture(filename) {
  const fixturePath = path.join(__dirname, 'fixtures/input', filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function loadOutputFixture(filename) {
  const fixturePath = path.join(__dirname, 'fixtures/output', filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function getResourceAttributes(result) {
  return result.resourceLogs[0].resource.attributes;
}

function getLogRecords(result) {
  return result.resourceLogs[0].scopeLogs[0].logRecords;
}

function findAttribute(attributes, key) {
  return attributes.find(a => a.key === key);
}

function createLogSpan(overrides = {}) {
  return {
    t: 'trace-1',
    s: 'span-1',
    p: 'parent-1',
    ts: 1544712660300,
    d: 1,
    n: 'log.pino',
    k: 2,
    f: { e: '321', h: 'host-id-1' },
    ...overrides,
    data: {
      log: { message: 'Example log record', level: 'info' },
      ...(overrides.data || {})
    }
  };
}

describe('logs/converters/otlp', () => {
  let hostnameStub;
  let platformStub;
  let ctxSnapshot;

  before(() => {
    // The OTLP context is a shared singleton. Keep a snapshot to not influence other test suites.
    ctxSnapshot = {
      _config: otlpCtx._config,
      _semConvVersion: otlpCtx._semConvVersion,
      _compiledSemConv: otlpCtx._compiledSemConv,
      _pid: otlpCtx._pid,
      _serviceName: otlpCtx._serviceName
    };

    otlpCtx.init({
      serviceName: 'my.service',
      tracing: { otlp: { enabled: true, semConvVersion: '1.23' } }
    });

    hostnameStub = sinon.stub(os, 'hostname').returns('test-hostname');
    platformStub = sinon.stub(process, 'platform').value('linux');
  });

  after(() => {
    hostnameStub.restore();
    platformStub.restore();
    Object.assign(otlpCtx, ctxSnapshot);
  });

  describe('converter', () => {
    describe('basic conversion', () => {
      it('converts a full log span payload to OTLP format', () => {
        const input = loadInputFixture('logs.json');
        const expectedOutput = loadOutputFixture('logs-output.json');

        const result = converter.transform(input);

        expect(result).to.deep.equal(expectedOutput);
      });

      it('includes expected resource attributes', () => {
        const result = converter.transform(loadInputFixture('logs.json'));

        const attrs = getResourceAttributes(result);
        expect(findAttribute(attrs, 'service.name')).to.deep.equal({
          key: 'service.name',
          value: { stringValue: 'my.service' }
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
        expect(findAttribute(attrs, 'process.pid')).to.deep.equal({
          key: 'process.pid',
          value: { intValue: 12345 }
        });
      });

      it('uses the instrumentation scope', () => {
        const result = converter.transform(loadInputFixture('logs.json'));

        expect(result.resourceLogs[0].scopeLogs[0].scope).to.deep.equal({
          name: 'instana.nodejs.tracer',
          version: '6.0.0'
        });
      });

      it('creates a single resource and scope for all log spans', () => {
        const result = converter.transform(loadInputFixture('logs.json'));

        expect(result.resourceLogs).to.have.lengthOf(1);
        expect(result.resourceLogs[0].scopeLogs).to.have.lengthOf(1);
        expect(getLogRecords(result)).to.have.lengthOf(7);
      });
    });

    describe('log record mapping', () => {
      it('maps all severity levels', () => {
        const records = getLogRecords(converter.transform(loadInputFixture('logs.json')));

        expect(records.map(r => [r.severityText, r.severityNumber])).to.deep.equal([
          ['info', 9],
          ['trace', 1],
          ['debug', 5],
          ['warn', 13],
          ['error', 17],
          ['fatal', 21],
          ['verbose', 0]
        ]);
      });

      it('uses the same value for timeUnixNano and observedTimeUnixNano', () => {
        const records = getLogRecords(converter.transform(loadInputFixture('logs.json')));

        records.forEach(record => {
          expect(record.timeUnixNano).to.equal(record.observedTimeUnixNano);
        });
      });

      it('wraps the message into a stringValue body', () => {
        const [record] = getLogRecords(converter.transform([createLogSpan()]));

        expect(record.body).to.deep.equal({ stringValue: 'Example log record' });
      });

      it('pads the trace id to 32 and the span id to 16 characters', () => {
        const [record] = getLogRecords(converter.transform([createLogSpan({ t: 'abc', p: 'def' })]));

        expect(record.traceId).to.have.lengthOf(32);
        expect(record.spanId).to.have.lengthOf(16);
      });

      it('uses the parent span id as spanId', () => {
        const [record] = getLogRecords(converter.transform([createLogSpan({ s: 'own', p: 'parent' })]));

        expect(record.spanId).to.equal('0000000000parent');
      });

      it('always provides an empty attributes list', () => {
        const records = getLogRecords(converter.transform(loadInputFixture('logs.json')));

        records.forEach(record => {
          expect(record.attributes).to.deep.equal([]);
        });
      });

      it('does not add trace span only fields', () => {
        const [record] = getLogRecords(converter.transform([createLogSpan()]));

        expect(record).to.not.have.property('name');
        expect(record).to.not.have.property('kind');
        expect(record).to.not.have.property('startTimeUnixNano');
        expect(record).to.not.have.property('endTimeUnixNano');
        expect(record).to.not.have.property('parentSpanId');
      });

      it('omits fields that cannot be derived from the span', () => {
        const [record] = getLogRecords(converter.transform([{ ts: 1544712660300, data: { log: {} } }]));

        expect(record).to.deep.equal({
          timeUnixNano: '1544712660300000000',
          observedTimeUnixNano: '1544712660300000000',
          attributes: []
        });
      });
    });

    describe('edge cases', () => {
      it('returns empty resourceLogs for no spans', () => {
        expect(converter.transform([])).to.deep.equal({ resourceLogs: [] });
      });

      it('skips spans that fail to convert and logs a debug message', () => {
        const logger = { debug: sinon.stub() };
        converter.init({ logger });

        const failing = createLogSpan();
        Object.defineProperty(failing, 'ts', {
          get() {
            throw new Error('boom');
          }
        });

        const result = converter.transform([failing, createLogSpan()]);

        expect(getLogRecords(result)).to.have.lengthOf(1);
        expect(logger.debug.calledOnce).to.be.true;

        converter.init({});
      });

      it('returns empty resourceLogs if every span fails to convert', () => {
        const failing = createLogSpan();
        Object.defineProperty(failing, 'data', {
          get() {
            throw new Error('boom');
          }
        });

        expect(converter.transform([failing])).to.deep.equal({ resourceLogs: [] });
      });
    });

    describe('exporter entry point', () => {
      const otlp = require('../../../src/otlpExporter');

      it('exposes logs.transform on the otlp exporter', () => {
        const result = otlp.logs.transform([createLogSpan()]);

        expect(result.resourceLogs).to.have.lengthOf(1);
      });

      it('identifies log spans', () => {
        expect(otlp.logs.isLogSpan(createLogSpan())).to.be.true;
        expect(otlp.logs.isLogSpan({ n: 'node.http.server', data: { http: {} } })).to.be.false;
      });
    });
  });
});
