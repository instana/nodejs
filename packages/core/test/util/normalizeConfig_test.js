/* eslint-env mocha */
/* eslint-disable dot-notation */

'use strict';

var expect = require('chai').expect;

var normalizeConfig = require('../../src/util/normalizeConfig');

describe('util.normalizeConfig', function() {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env['INSTANA_SERVICE_NAME'];
    delete process.env['INSTANA_DISABLE_TRACING'];
    delete process.env['INSTANA_DISABLE_AUTO_INSTR'];
    delete process.env['INSTANA_STACK_TRACE_LENGTH'];
  }

  it('should apply all defaults', function() {
    checkDefaults(normalizeConfig());
    checkDefaults(normalizeConfig({}));
    checkDefaults(normalizeConfig({ tracing: {}, metrics: {} }));
    checkDefaults(normalizeConfig({ unknowConfigOption: 13 }));
  });

  it('should accept service name', function() {
    var config = normalizeConfig({ serviceName: 'custom-service-name' });
    expect(config.serviceName).to.equal('custom-service-name');
  });

  it('should accept service name from env var', function() {
    process.env['INSTANA_SERVICE_NAME'] = 'very-custom-service-name';
    var config = normalizeConfig();
    expect(config.serviceName).to.equal('very-custom-service-name');
  });

  it('should not accept non-string service name', function() {
    var config = normalizeConfig({ serviceName: 42 });
    expect(config.serviceName).to.not.exist;
  });

  it('should use custom config.metrics.timeBetweenHealthcheckCalls', function() {
    var config = normalizeConfig({
      metrics: {
        timeBetweenHealthcheckCalls: 9876
      }
    });
    expect(config.metrics.timeBetweenHealthcheckCalls).to.equal(9876);
    expect(config.timeBetweenHealthcheckCalls).to.not.exist;
  });

  it('should use legacy config.timeBetweenHealthcheckCalls', function() {
    var config = normalizeConfig({ timeBetweenHealthcheckCalls: 1234 });
    expect(config.metrics.timeBetweenHealthcheckCalls).to.equal(1234);
    expect(config.timeBetweenHealthcheckCalls).to.not.exist;
  });

  it('should disable tracing', function() {
    var config = normalizeConfig({ tracing: { enabled: false } });
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
  });

  it('should disable tracing via INSTANA_DISABLE_TRACING', function() {
    process.env['INSTANA_DISABLE_TRACING'] = true;
    var config = normalizeConfig();
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
  });

  it('should disable automatic tracing', function() {
    var config = normalizeConfig({ tracing: { automaticTracingEnabled: false } });
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
  });

  it('should disable automatic tracing (legacy config)', function() {
    var config = normalizeConfig({ tracing: { disableAutomaticTracing: true } });
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
  });

  it('should disable automatic tracing via INSTANA_DISABLE_AUTO_INSTR', function() {
    process.env['INSTANA_DISABLE_AUTO_INSTR'] = 'true';
    var config = normalizeConfig();
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
  });

  it('should not enable automatic tracing when tracing is disabled in general', function() {
    var config = normalizeConfig({
      tracing: {
        enabled: false,
        automaticTracingEnabled: true
      }
    });
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
  });

  it('should use custom transmission settings', function() {
    var config = normalizeConfig({
      tracing: {
        maxBufferedSpans: 13,
        forceTransmissionStartingAt: 2
      }
    });
    expect(config.tracing.maxBufferedSpans).to.equal(13);
    expect(config.tracing.forceTransmissionStartingAt).to.equal(2);
  });

  it('should use extra http headers (and normalize to lower case)', function() {
    var config = normalizeConfig({
      tracing: {
        http: {
          extraHttpHeadersToCapture: ['yo', 'LO']
        }
      }
    });
    expect(config.tracing.http.extraHttpHeadersToCapture).to.deep.equal(['yo', 'lo']);
  });

  it('should reject non-array extra http headers configuration value', function() {
    var config = normalizeConfig({
      tracing: {
        http: {
          extraHttpHeadersToCapture: 'yolo'
        }
      }
    });
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.an('array');
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.empty;
  });

  it('should accept numerical custom stack trace length', function() {
    var config = normalizeConfig({ tracing: { stackTraceLength: 666 } });
    expect(config.tracing.stackTraceLength).to.equal(666);
  });

  it('should normalize numbers for custom stack trace length', function() {
    var config = normalizeConfig({ tracing: { stackTraceLength: -28.08 } });
    expect(config.tracing.stackTraceLength).to.be.a('number');
    expect(config.tracing.stackTraceLength).to.equal(28);
  });

  it('should accept number-like strings for custom stack trace length', function() {
    var config = normalizeConfig({ tracing: { stackTraceLength: '1302' } });
    expect(config.tracing.stackTraceLength).to.be.a('number');
    expect(config.tracing.stackTraceLength).to.equal(1302);
  });

  it('should normalize number-like strings for custom stack trace length', function() {
    var config = normalizeConfig({ tracing: { stackTraceLength: '-16.04' } });
    expect(config.tracing.stackTraceLength).to.be.a('number');
    expect(config.tracing.stackTraceLength).to.equal(16);
  });

  it('should reject non-numerical strings for custom stack trace length', function() {
    var config = normalizeConfig({ tracing: { stackTraceLength: 'three' } });
    expect(config.tracing.stackTraceLength).to.be.a('number');
    expect(config.tracing.stackTraceLength).to.equal(10);
  });

  it('should reject custom stack trace length which is neither a number nor a string', function() {
    var config = normalizeConfig({ tracing: { stackTraceLength: false } });
    expect(config.tracing.stackTraceLength).to.be.a('number');
    expect(config.tracing.stackTraceLength).to.equal(10);
  });

  it('should read stack trace length from INSTANA_STACK_TRACE_LENGTH', function() {
    process.env['INSTANA_STACK_TRACE_LENGTH'] = '3';
    var config = normalizeConfig();
    expect(config.tracing.stackTraceLength).to.equal(3);
  });

  it('should accept custom secrets config', function() {
    var config = normalizeConfig({
      secrets: {
        matcherMode: 'equals',
        keywords: ['custom-secret', 'sheesh']
      }
    });
    expect(config.secrets.matcherMode).to.equal('equals');
    expect(config.secrets.keywords).to.deep.equal(['custom-secret', 'sheesh']);
  });

  it('should reject non-string matcher mode', function() {
    var config = normalizeConfig({ secrets: { matcherMode: 43 } });
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
  });

  it('should reject unknown string matcher mode', function() {
    var config = normalizeConfig({ secrets: { matcherMode: 'whatever' } });
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
  });

  it('should reject non-array keywords', function() {
    var config = normalizeConfig({ secrets: { keywords: 'yes' } });
    expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
  });

  function checkDefaults(config) {
    expect(config).to.be.an('object');
    expect(config.serviceName).to.not.exist;
    expect(config.metrics).to.be.an('object');
    expect(config.metrics.timeBetweenHealthcheckCalls).to.equal(3000);
    expect(config.tracing).to.be.an('object');
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.true;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
    expect(config.tracing.forceTransmissionStartingAt).to.equal(500);
    expect(config.tracing.maxBufferedSpans).to.equal(1000);
    expect(config.tracing.http).to.be.an('object');
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.empty;
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.an('array');
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.empty;
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.empty;
    expect(config.tracing.stackTraceLength).to.equal(10);
    expect(config.secrets).to.be.an('object');
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
    expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
  }
});
