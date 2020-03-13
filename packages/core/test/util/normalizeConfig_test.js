'use strict';

const expect = require('chai').expect;

const normalizeConfig = require('../../src/util/normalizeConfig');

describe('util.normalizeConfig', () => {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env.INSTANA_SERVICE_NAME;
    delete process.env.INSTANA_METRICS_TRANSMISSION_DELAY;
    delete process.env.INSTANA_DISABLE_TRACING;
    delete process.env.INSTANA_FORCE_TRANSMISSION_STARTING_AT;
    delete process.env.INSTANA_TRACING_TRANSMISSION_DELAY;
    delete process.env.INSTANA_DISABLE_AUTO_INSTR;
    delete process.env.INSTANA_STACK_TRACE_LENGTH;
    delete process.env.INSTANA_DISABLED_TRACERS;
  }

  it('should apply all defaults', () => {
    checkDefaults(normalizeConfig());
    checkDefaults(normalizeConfig({}));
    checkDefaults(normalizeConfig({ tracing: {}, metrics: {} }));
    checkDefaults(normalizeConfig({ unknowConfigOption: 13 }));
  });

  it('should accept service name', () => {
    const config = normalizeConfig({ serviceName: 'custom-service-name' });
    expect(config.serviceName).to.equal('custom-service-name');
  });

  it('should accept service name from env var', () => {
    process.env.INSTANA_SERVICE_NAME = 'very-custom-service-name';
    const config = normalizeConfig();
    expect(config.serviceName).to.equal('very-custom-service-name');
  });

  it('should not accept non-string service name', () => {
    const config = normalizeConfig({ serviceName: 42 });
    expect(config.serviceName).to.not.exist;
  });

  it('should use custom metrics transmission settings from config', () => {
    const config = normalizeConfig({
      metrics: {
        transmissionDelay: 9753
      }
    });
    expect(config.metrics.transmissionDelay).to.equal(9753);
  });

  it('should use custom metrics transmission settings from env vars', () => {
    process.env.INSTANA_METRICS_TRANSMISSION_DELAY = '2500';
    const config = normalizeConfig();
    expect(config.metrics.transmissionDelay).to.equal(2500);
  });

  it('should use default metrics transmission settings when env vars are non-numerical', () => {
    process.env.INSTANA_METRICS_TRANSMISSION_DELAY = 'x2500';
    const config = normalizeConfig();
    expect(config.metrics.transmissionDelay).to.equal(1000);
  });

  it('should use custom config.metrics.timeBetweenHealthcheckCalls', () => {
    const config = normalizeConfig({
      metrics: {
        timeBetweenHealthcheckCalls: 9876
      }
    });
    expect(config.metrics.timeBetweenHealthcheckCalls).to.equal(9876);
    expect(config.timeBetweenHealthcheckCalls).to.not.exist;
  });

  it('should use legacy config.timeBetweenHealthcheckCalls', () => {
    const config = normalizeConfig({ timeBetweenHealthcheckCalls: 1234 });
    expect(config.metrics.timeBetweenHealthcheckCalls).to.equal(1234);
    expect(config.timeBetweenHealthcheckCalls).to.not.exist;
  });

  it('should disable tracing', () => {
    const config = normalizeConfig({ tracing: { enabled: false } });
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
  });

  it('should disable tracing via INSTANA_DISABLE_TRACING', () => {
    process.env.INSTANA_DISABLE_TRACING = true;
    const config = normalizeConfig();
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
  });

  it('should disable automatic tracing', () => {
    const config = normalizeConfig({ tracing: { automaticTracingEnabled: false } });
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
  });

  it('should disable automatic tracing (legacy config)', () => {
    const config = normalizeConfig({ tracing: { disableAutomaticTracing: true } });
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
  });

  it('should disable automatic tracing via INSTANA_DISABLE_AUTO_INSTR', () => {
    process.env.INSTANA_DISABLE_AUTO_INSTR = 'true';
    const config = normalizeConfig();
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
  });

  it('should not enable automatic tracing when tracing is disabled in general', () => {
    const config = normalizeConfig({
      tracing: {
        enabled: false,
        automaticTracingEnabled: true
      }
    });
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
  });

  it('should use custom tracing transmission settings from config', () => {
    const config = normalizeConfig({
      tracing: {
        maxBufferedSpans: 13,
        forceTransmissionStartingAt: 2,
        transmissionDelay: 9753
      }
    });
    expect(config.tracing.maxBufferedSpans).to.equal(13);
    expect(config.tracing.forceTransmissionStartingAt).to.equal(2);
    expect(config.tracing.transmissionDelay).to.equal(9753);
  });

  it('should use custom tracing transmission settings from env vars', () => {
    process.env.INSTANA_FORCE_TRANSMISSION_STARTING_AT = '2468';
    process.env.INSTANA_TRACING_TRANSMISSION_DELAY = '2500';
    const config = normalizeConfig();
    expect(config.tracing.forceTransmissionStartingAt).to.equal(2468);
    expect(config.tracing.transmissionDelay).to.equal(2500);
  });

  it('should use default tracing transmission settings when env vars are non-numerical', () => {
    process.env.INSTANA_FORCE_TRANSMISSION_STARTING_AT = 'a2468';
    process.env.INSTANA_TRACING_TRANSMISSION_DELAY = 'x2500';
    const config = normalizeConfig();
    expect(config.tracing.forceTransmissionStartingAt).to.equal(500);
    expect(config.tracing.transmissionDelay).to.equal(1000);
  });

  it('should use extra http headers (and normalize to lower case)', () => {
    const config = normalizeConfig({
      tracing: {
        http: {
          extraHttpHeadersToCapture: ['yo', 'LO']
        }
      }
    });
    expect(config.tracing.http.extraHttpHeadersToCapture).to.deep.equal(['yo', 'lo']);
  });

  it('should reject non-array extra http headers configuration value', () => {
    const config = normalizeConfig({
      tracing: {
        http: {
          extraHttpHeadersToCapture: 'yolo'
        }
      }
    });
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.an('array');
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.empty;
  });

  it('should accept numerical custom stack trace length', () => {
    const config = normalizeConfig({ tracing: { stackTraceLength: 666 } });
    expect(config.tracing.stackTraceLength).to.equal(666);
  });

  it('should normalize numbers for custom stack trace length', () => {
    const config = normalizeConfig({ tracing: { stackTraceLength: -28.08 } });
    expect(config.tracing.stackTraceLength).to.be.a('number');
    expect(config.tracing.stackTraceLength).to.equal(28);
  });

  it('should accept number-like strings for custom stack trace length', () => {
    const config = normalizeConfig({ tracing: { stackTraceLength: '1302' } });
    expect(config.tracing.stackTraceLength).to.be.a('number');
    expect(config.tracing.stackTraceLength).to.equal(1302);
  });

  it('should normalize number-like strings for custom stack trace length', () => {
    const config = normalizeConfig({ tracing: { stackTraceLength: '-16.04' } });
    expect(config.tracing.stackTraceLength).to.be.a('number');
    expect(config.tracing.stackTraceLength).to.equal(16);
  });

  it('should reject non-numerical strings for custom stack trace length', () => {
    const config = normalizeConfig({ tracing: { stackTraceLength: 'three' } });
    expect(config.tracing.stackTraceLength).to.be.a('number');
    expect(config.tracing.stackTraceLength).to.equal(10);
  });

  it('should reject custom stack trace length which is neither a number nor a string', () => {
    const config = normalizeConfig({ tracing: { stackTraceLength: false } });
    expect(config.tracing.stackTraceLength).to.be.a('number');
    expect(config.tracing.stackTraceLength).to.equal(10);
  });

  it('should read stack trace length from INSTANA_STACK_TRACE_LENGTH', () => {
    process.env.INSTANA_STACK_TRACE_LENGTH = '3';
    const config = normalizeConfig();
    expect(config.tracing.stackTraceLength).to.equal(3);
  });

  it('should not disable individual tracers by default', () => {
    const config = normalizeConfig();
    expect(config.tracing.disabledTracers).to.deep.equal([]);
  });

  it('should disable individual tracers via config', () => {
    const config = normalizeConfig({
      tracing: {
        disabledTracers: ['graphQL', 'GRPC']
      }
    });
    // values will be normalized to lower case
    expect(config.tracing.disabledTracers).to.deep.equal(['graphql', 'grpc']);
  });

  it('should disable individual tracers via env var', () => {
    process.env.INSTANA_DISABLED_TRACERS = 'graphQL   , GRPC';
    const config = normalizeConfig();
    // values will be normalized to lower case
    expect(config.tracing.disabledTracers).to.deep.equal(['graphql', 'grpc']);
  });

  it('config should take precedence over env vars when disabling individual tracers', () => {
    process.env.INSTANA_DISABLED_TRACERS = 'foo, bar';
    const config = normalizeConfig({
      tracing: {
        disabledTracers: ['baz', 'fizz']
      }
    });
    // values will be normalized to lower case
    expect(config.tracing.disabledTracers).to.deep.equal(['baz', 'fizz']);
  });

  it('should accept custom secrets config', () => {
    const config = normalizeConfig({
      secrets: {
        matcherMode: 'equals',
        keywords: ['custom-secret', 'sheesh']
      }
    });
    expect(config.secrets.matcherMode).to.equal('equals');
    expect(config.secrets.keywords).to.deep.equal(['custom-secret', 'sheesh']);
  });

  it('should reject non-string matcher mode', () => {
    const config = normalizeConfig({ secrets: { matcherMode: 43 } });
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
  });

  it('should reject unknown string matcher mode', () => {
    const config = normalizeConfig({ secrets: { matcherMode: 'whatever' } });
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
  });

  it('should reject non-array keywords', () => {
    const config = normalizeConfig({ secrets: { keywords: 'yes' } });
    expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
  });

  function checkDefaults(config) {
    expect(config).to.be.an('object');
    expect(config.serviceName).to.not.exist;
    expect(config.metrics).to.be.an('object');
    expect(config.metrics.transmissionDelay).to.equal(1000);
    expect(config.metrics.timeBetweenHealthcheckCalls).to.equal(3000);
    expect(config.tracing).to.be.an('object');
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.true;
    expect(config.tracing.disableAutomaticTracing).to.not.exist;
    expect(config.tracing.transmissionDelay).to.equal(1000);
    expect(config.tracing.forceTransmissionStartingAt).to.equal(500);
    expect(config.tracing.maxBufferedSpans).to.equal(1000);
    expect(config.tracing.disabledTracers).to.deep.equal([]);
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
