/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const spanExporter = require('../../src/tracing/spanExporter');
const testUtils = require('../test_util');

describe('tracing/spanExporter', () => {
  let connection;

  function init(otlpEnabled, otlpOptions = {}) {
    spanExporter.init(
      { logger: testUtils.createFakeLogger(), tracing: { otlp: { enabled: otlpEnabled, port: 4318, ...otlpOptions } } },
      connection
    );
  }

  function createSpan(overrides = {}) {
    return {
      t: '1234567803',
      s: '1234567892',
      p: '1234567891',
      n: 'node.http.server',
      k: 1,
      f: { e: '45543', h: 'localhost' },
      ts: Date.now(),
      d: 25,
      ec: 0,
      data: { http: { operation: 'GET', url: '/orders', status: 200 } },
      ...overrides
    };
  }

  function createLogSpan(overrides = {}) {
    return createSpan({
      n: 'log.pino',
      k: 2,
      data: { log: { message: 'Example log record', level: 'info' } },
      ...overrides
    });
  }

  beforeEach(() => {
    connection = { sendSpans: sinon.stub().callsFake((_p, cb) => cb()), sendLogs: sinon.stub() };
    connection.sendLogs.callsFake((_p, cb) => cb());
  });

  describe('instana format', () => {
    beforeEach(() => init(false));

    it('should send spans in Instana format via sendSpans without an export target', done => {
      spanExporter.export([createSpan()], (error, failedSpans) => {
        expect(error).to.not.exist;
        expect(failedSpans).to.not.exist;
        expect(connection.sendSpans.calledOnce).to.be.true;
        expect(connection.sendSpans.getCall(0).args[2]).to.not.exist;
        expect(connection.sendSpans.getCall(0).args[0]).to.be.an('array').with.lengthOf(1);
        expect(connection.sendLogs.called).to.be.false;
        done();
      });
    });

    it('should drop spans without trace ID when transforming', () => {
      expect(spanExporter.transform([createSpan({ t: undefined })])).to.have.lengthOf(0);
    });

    it('should hand back all spans on failure', done => {
      const spans = [createSpan()];
      connection.sendSpans.callsFake((_p, cb) => cb(new Error('nope')));

      spanExporter.export(spans, (error, failedSpans) => {
        expect(error.message).to.equal('nope');
        expect(failedSpans).to.equal(spans);
        done();
      });
    });
  });

  describe('otlp format', () => {
    beforeEach(() => init(true));

    it('should split trace and log spans and send them as separate signals', done => {
      spanExporter.export([createSpan(), createLogSpan({ s: '1234567893' })], error => {
        expect(error).to.not.exist;
        expect(connection.sendSpans.calledOnce).to.be.true;
        expect(connection.sendLogs.calledOnce).to.be.true;
        expect(connection.sendSpans.getCall(0).args[0]).to.have.property('resourceSpans');
        expect(connection.sendLogs.getCall(0).args[0]).to.have.property('resourceLogs');
        done();
      });
    });

    it('should tell the connection where to deliver traces and logs', done => {
      spanExporter.export([createSpan(), createLogSpan({ s: '1234567893' })], () => {
        expect(connection.sendSpans.getCall(0).args[2]).to.deep.include({ path: '/v1/traces', port: 4318 });
        expect(connection.sendLogs.getCall(0).args[2]).to.deep.include({ path: '/v1/logs', port: 4318 });
        done();
      });
    });

    it('should pass the configured endpoint url and headers to the connection', done => {
      init(true, { endpoint: 'https://otlp.example.com/', headers: { 'x-api-key': 'k' } });

      spanExporter.export([createSpan(), createLogSpan({ s: '1234567893' })], () => {
        expect(connection.sendSpans.getCall(0).args[2]).to.deep.equal({
          path: '/v1/traces',
          port: 4318,
          url: 'https://otlp.example.com/v1/traces',
          headers: { 'x-api-key': 'k' }
        });
        expect(connection.sendLogs.getCall(0).args[2].url).to.equal('https://otlp.example.com/v1/logs');
        done();
      });
    });

    it('should not call sendSpans if there are only log spans', done => {
      spanExporter.export([createLogSpan()], () => {
        expect(connection.sendSpans.called).to.be.false;
        expect(connection.sendLogs.calledOnce).to.be.true;
        done();
      });
    });

    it('should not call sendLogs if there are no log spans', done => {
      spanExporter.export([createSpan()], () => {
        expect(connection.sendLogs.called).to.be.false;
        done();
      });
    });

    it('should only hand back the spans of the signal that failed', done => {
      const traceSpan = createSpan();
      const logSpan = createLogSpan({ s: '1234567893' });
      connection.sendLogs.callsFake((_p, cb) => cb(new Error('logs failed')));

      spanExporter.export([traceSpan, logSpan], (error, failedSpans) => {
        expect(error.message).to.equal('logs failed');
        expect(failedSpans).to.deep.equal([logSpan]);
        done();
      });
    });

    it('should call back exactly once when both signals fail', done => {
      const callback = sinon.spy();
      connection.sendSpans.callsFake((_p, cb) => cb(new Error('traces failed')));
      connection.sendLogs.callsFake((_p, cb) => cb(new Error('logs failed')));

      spanExporter.export([createSpan(), createLogSpan({ s: '1234567893' })], (...args) => {
        callback(...args);
        expect(callback.calledOnce).to.be.true;
        expect(args[0].message).to.equal('traces failed');
        expect(args[1]).to.have.lengthOf(2);
        done();
      });
    });

    it('should drop log spans and not fail if the connection has no sendLogs', done => {
      delete connection.sendLogs;

      spanExporter.export([createLogSpan()], (error, failedSpans) => {
        expect(error).to.not.exist;
        expect(failedSpans).to.not.exist;
        expect(connection.sendSpans.called).to.be.false;
        done();
      });
    });

    it('should leave log spans out of the trace payload when transforming', () => {
      const payload = spanExporter.transform([createSpan(), createLogSpan({ s: '1234567893' })]);
      expect(payload.resourceSpans[0].scopeSpans[0].spans).to.have.lengthOf(1);
    });
  });

  it('should pick the format again on activate', done => {
    init(false);
    spanExporter.activate({ tracing: { otlp: { enabled: true } } });

    spanExporter.export([createSpan()], () => {
      expect(connection.sendSpans.getCall(0).args[0]).to.have.property('resourceSpans');
      done();
    });
  });
});
