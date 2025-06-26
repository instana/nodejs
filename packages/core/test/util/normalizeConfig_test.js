/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');

const normalizeConfig = require('../../src/util/normalizeConfig');

describe('util.normalizeConfig', () => {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env.INSTANA_DISABLED_TRACERS;
    delete process.env.INSTANA_DISABLE_AUTO_INSTR;
    delete process.env.INSTANA_DISABLE_TRACING;
    delete process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS;
    delete process.env.INSTANA_TRACING_DISABLE_GROUPS;
    delete process.env.INSTANA_TRACE_IMMEDIATELY;
    delete process.env.INSTANA_EXTRA_HTTP_HEADERS;
    delete process.env.INSTANA_FORCE_TRANSMISSION_STARTING_AT;
    delete process.env.INSTANA_METRICS_TRANSMISSION_DELAY;
    delete process.env.INSTANA_SECRETS;
    delete process.env.INSTANA_SERVICE_NAME;
    delete process.env.INSTANA_STACK_TRACE_LENGTH;
    delete process.env.INSTANA_TRACING_TRANSMISSION_DELAY;
    delete process.env.INSTANA_SPANBATCHING_ENABLED;
    delete process.env.INSTANA_DISABLE_SPANBATCHING;
    delete process.env.INSTANA_DISABLE_W3C_TRACE_CORRELATION;
    delete process.env.INSTANA_KAFKA_TRACE_CORRELATION;
    delete process.env.INSTANA_PACKAGE_JSON_PATH;
    delete process.env.INSTANA_ALLOW_ROOT_EXIT_SPAN;
    delete process.env.INSTANA_IGNORE_ENDPOINTS;
    delete process.env.INSTANA_IGNORE_ENDPOINTS_PATH;
    delete process.env.INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION;
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
  });

  it('should disable tracing with enabled: false', () => {
    const config = normalizeConfig({ tracing: { enabled: false } });
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
  });

  it('should disable tracing with disable: true', () => {
    const config = normalizeConfig({ tracing: { enabled: false } });
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
  });

  it('should disable tracing via deprecated INSTANA_DISABLE_TRACING', () => {
    process.env.INSTANA_DISABLE_TRACING = true;
    const config = normalizeConfig();
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
  });

  it('should disable automatic tracing', () => {
    const config = normalizeConfig({ tracing: { automaticTracingEnabled: false } });
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
  });

  it('should disable automatic tracing via INSTANA_DISABLE_AUTO_INSTR', () => {
    process.env.INSTANA_DISABLE_AUTO_INSTR = 'true';
    const config = normalizeConfig();
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.false;
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
  });

  it('should enable immediate tracing activation', () => {
    const config = normalizeConfig({ tracing: { activateImmediately: true } });
    expect(config.tracing.activateImmediately).to.be.true;
  });

  it('should enable immediate tracing activation via INSTANA_TRACE_IMMEDIATELY', () => {
    process.env.INSTANA_TRACE_IMMEDIATELY = 'true';
    const config = normalizeConfig();
    expect(config.tracing.activateImmediately).to.be.true;
  });

  it('should not enable immediate tracing activation when tracing is disabled in general', () => {
    const config = normalizeConfig({
      tracing: {
        enabled: false,
        activateImmediately: true
      }
    });
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.activateImmediately).to.be.false;
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

  it('should parse extra headers from env var', () => {
    process.env.INSTANA_EXTRA_HTTP_HEADERS = ' X-Header-1 ; X-hEADer-2 , X-Whatever ';
    const config = normalizeConfig();
    expect(config.tracing.http.extraHttpHeadersToCapture).to.deep.equal(['x-header-1', 'x-header-2', 'x-whatever']);
  });

  it('must use default extra headers (empty list) when INSTANA_EXTRA_HTTP_HEADERS is invalid', () => {
    process.env.INSTANA_EXTRA_HTTP_HEADERS = ' \n \t ';
    const config = normalizeConfig();
    expect(config.tracing.http.extraHttpHeadersToCapture).to.deep.equal([]);
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

  it('should not disable individual instrumentations by default', () => {
    const config = normalizeConfig();
    expect(config.tracing.disable).to.deep.equal({});
  });

  it('should disable individual instrumentations via config', () => {
    const config = normalizeConfig({
      tracing: {
        disabledTracers: ['graphQL', 'GRPC']
      }
    });
    // values will be normalized to lower case
    expect(config.tracing.disable.instrumentations).to.deep.equal(['graphql', 'grpc']);
  });

  it('should disable individual instrumentations via env var', () => {
    process.env.INSTANA_DISABLED_TRACERS = 'graphQL   , GRPC';
    const config = normalizeConfig();
    // values will be normalized to lower case
    expect(config.tracing.disable.instrumentations).to.deep.equal(['graphql', 'grpc']);
  });

  it('config should take precedence over env vars when disabling individual tracers', () => {
    process.env.INSTANA_DISABLED_TRACERS = 'foo, bar';
    const config = normalizeConfig({
      tracing: {
        disabledTracers: ['baz', 'fizz']
      }
    });
    // values will be normalized to lower case
    expect(config.tracing.disable.instrumentations).to.deep.equal(['baz', 'fizz']);
  });

  it('should disable individual instrumentations via disable config', () => {
    const config = normalizeConfig({
      tracing: {
        disable: ['graphQL', 'GRPC']
      }
    });
    expect(config.tracing.disable.instrumentations).to.deep.equal(['graphql', 'grpc']);
  });

  it('should disable individual instrumentations via disable.instrumentations config', () => {
    const config = normalizeConfig({
      tracing: {
        disable: { instrumentations: ['graphQL', 'GRPC'] }
      }
    });
    expect(config.tracing.disable.instrumentations).to.deep.equal(['graphql', 'grpc']);
  });

  it('config should take precedence over INSTANA_TRACING_DISABLE_INSTRUMENTATIONS  for config', () => {
    process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'foo, bar';
    const config = normalizeConfig({
      tracing: {
        disable: { instrumentations: ['baz', 'fizz'] }
      }
    });
    expect(config.tracing.disable.instrumentations).to.deep.equal(['baz', 'fizz']);
  });

  it('should disable multiple instrumentations via env var INSTANA_TRACING_DISABLE_INSTRUMENTATIONS', () => {
    process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'graphQL   , GRPC, http';
    const config = normalizeConfig();
    expect(config.tracing.disable.instrumentations).to.deep.equal(['graphql', 'grpc', 'http']);
  });

  it('should handle single instrumentations via INSTANA_TRACING_DISABLE_INSTRUMENTATIONS', () => {
    process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'console';
    const config = normalizeConfig();
    expect(config.tracing.disable.instrumentations).to.deep.equal(['console']);
  });

  it('should trim whitespace from tracer names', () => {
    process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = '  graphql  ,  grpc  ';
    const config = normalizeConfig();
    expect(config.tracing.disable.instrumentations).to.deep.equal(['graphql', 'grpc']);
  });

  it('should prefer INSTANA_TRACING_DISABLE_INSTRUMENTATIONS over INSTANA_DISABLED_TRACERS', () => {
    process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'redis';
    process.env.INSTANA_DISABLED_TRACERS = 'postgres';
    const config = normalizeConfig();
    expect(config.tracing.disable.instrumentations).to.deep.equal(['redis']);
  });

  it('should disable individual groups via disable config', () => {
    const config = normalizeConfig({
      tracing: {
        disable: { groups: ['logging'] }
      }
    });
    expect(config.tracing.disable.groups).to.deep.equal(['logging']);
  });

  it('config should disable when env var INSTANA_TRACING_DISABLE_GROUPS is set', () => {
    process.env.INSTANA_TRACING_DISABLE_GROUPS = 'frameworks, databases';
    const config = normalizeConfig({});
    expect(config.tracing.disable.groups).to.deep.equal(['frameworks', 'databases']);
  });

  it('config should take precedence over INSTANA_TRACING_DISABLE_GROUPS when disabling groups', () => {
    process.env.INSTANA_TRACING_DISABLE_GROUPS = 'frameworks, databases';
    const config = normalizeConfig({
      tracing: {
        disable: { groups: ['LOGGING'] }
      }
    });
    expect(config.tracing.disable.groups).to.deep.equal(['logging']);
  });

  it('should disable instrumentations and groups when both configured', () => {
    const config = normalizeConfig({
      tracing: {
        disable: { groups: ['LOGGING'], instrumentations: ['redis', 'kafka'] }
      }
    });
    expect(config.tracing.disable.groups).to.deep.equal(['logging']);
    expect(config.tracing.disable.instrumentations).to.deep.equal(['redis', 'kafka']);
  });

  it('should disable instrumentations and groups when both env variables provided', () => {
    process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'redis';
    process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging';
    const config = normalizeConfig();
    expect(config.tracing.disable.instrumentations).to.deep.equal(['redis']);
    expect(config.tracing.disable.groups).to.deep.equal(['logging']);
  });

  it('should disable all tracing via INSTANA_TRACING_DISABLE', () => {
    process.env.INSTANA_TRACING_DISABLE = true;
    const config = normalizeConfig();
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.disable).to.deep.equal({});
    expect(config.tracing.automaticTracingEnabled).to.be.false;
  });

  it('should disable all tracing via config tracing.disable', () => {
    const config = normalizeConfig({
      tracing: {
        disable: true
      }
    });
    expect(config.tracing.enabled).to.be.false;
    expect(config.tracing.disable).to.deep.equal({});
    expect(config.tracing.automaticTracingEnabled).to.be.false;
  });

  // delete this test when we switch to opt-out
  it('should enable span batching via config in transition phase', () => {
    const config = normalizeConfig({ tracing: { spanBatchingEnabled: true } });
    expect(config.tracing.spanBatchingEnabled).to.be.true;
  });

  // delete this test when we switch to opt-out
  it('should enable span batching via INSTANA_SPANBATCHING_ENABLED in transition phase', () => {
    process.env.INSTANA_SPANBATCHING_ENABLED = 'true';
    const config = normalizeConfig();
    expect(config.tracing.spanBatchingEnabled).to.be.true;
  });

  it('should ignore non-boolean span batching config value', () => {
    const config = normalizeConfig({ tracing: { spanBatchingEnabled: 73 } });
    // test needs to be updated once we switch to opt-out
    expect(config.tracing.spanBatchingEnabled).to.be.false;
  });

  it('should disable span batching', () => {
    // test only becomes relevant once we switch to opt-out
    const config = normalizeConfig({ tracing: { spanBatchingEnabled: false } });
    expect(config.tracing.spanBatchingEnabled).to.be.false;
  });

  it('should disable span batching via INSTANA_DISABLE_SPANBATCHING', () => {
    // test only becomes relevant once we switch to opt-out
    process.env.INSTANA_DISABLE_SPANBATCHING = 'true';
    const config = normalizeConfig();
    expect(config.tracing.spanBatchingEnabled).to.be.false;
  });

  it('should disable W3C trace correlation', () => {
    const config = normalizeConfig({ tracing: { disableW3cTraceCorrelation: true } });
    expect(config.tracing.disableW3cTraceCorrelation).to.be.true;
  });

  it('should disable W3C trace correlation via INSTANA_DISABLE_W3C_TRACE_CORRELATION', () => {
    process.env.INSTANA_DISABLE_W3C_TRACE_CORRELATION = 'false'; // any non-empty string will disable, even "false"!
    const config = normalizeConfig();
    expect(config.tracing.disableW3cTraceCorrelation).to.be.true;
  });

  it('should disable Kafka trace correlation', () => {
    const config = normalizeConfig({ tracing: { kafka: { traceCorrelation: false } } });
    expect(config.tracing.kafka.traceCorrelation).to.be.false;
  });

  it('should disable Kafka trace correlation via INSTANA_KAFKA_TRACE_CORRELATION', () => {
    process.env.INSTANA_KAFKA_TRACE_CORRELATION = 'false';
    const config = normalizeConfig();
    expect(config.tracing.kafka.traceCorrelation).to.be.false;
  });

  it('should disable opentelemetry if config is set', () => {
    const config = normalizeConfig({
      tracing: { useOpentelemetry: false }
    });
    expect(config.tracing.useOpentelemetry).to.equal(false);
  });

  it('should enable opentelemetry if config is set', () => {
    const config = normalizeConfig({
      tracing: { useOpentelemetry: true }
    });
    expect(config.tracing.useOpentelemetry).to.equal(true);
  });

  it('should disable opentelemetry if INSTANA_DISABLE_USE_OPENTELEMETRY is set', () => {
    process.env.INSTANA_DISABLE_USE_OPENTELEMETRY = 'true';
    const config = normalizeConfig();
    expect(config.tracing.useOpentelemetry).to.equal(false);
  });

  it('should enable opentelemetry if INSTANA_DISABLE_USE_OPENTELEMETRY is set', () => {
    process.env.INSTANA_DISABLE_USE_OPENTELEMETRY = 'false';
    const config = normalizeConfig();
    expect(config.tracing.useOpentelemetry).to.equal(true);
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

  it("should set keywords to empty array for matcher mode 'none'", () => {
    const config = normalizeConfig({
      secrets: {
        matcherMode: 'none'
      }
    });
    expect(config.secrets.matcherMode).to.equal('none');
    expect(config.secrets.keywords).to.deep.equal([]);
  });

  it('should reject non-string matcher mode', () => {
    const config = normalizeConfig({ secrets: { matcherMode: 43 } });
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
    expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
  });

  it('should reject unknown matcher mode from config', () => {
    const config = normalizeConfig({ secrets: { matcherMode: 'whatever' } });
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
    expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
  });

  it('should reject non-array keywords', () => {
    const config = normalizeConfig({ secrets: { keywords: 'yes' } });
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
    expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
  });

  it('should parse secrets from env var', () => {
    process.env.INSTANA_SECRETS = ' eQuaLs-igNore-case  :  concealed  ,  hush  ';
    const config = normalizeConfig();
    expect(config.secrets.matcherMode).to.equal('equals-ignore-case');
    expect(config.secrets.keywords).to.deep.equal(['concealed', 'hush']);
  });

  it('must use default secrets when INSTANA_SECRETS is invalid', () => {
    process.env.INSTANA_SECRETS = 'whatever';
    const config = normalizeConfig();
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
    expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
  });

  it("must accept INSTANA_SECRETS without secrets list if matcher mode is 'none'", () => {
    process.env.INSTANA_SECRETS = 'NONE';
    const config = normalizeConfig();
    expect(config.secrets.matcherMode).to.equal('none');
    expect(config.secrets.keywords).to.deep.equal([]);
  });

  it('should reject unknown matcher mode from INSTANA_SECRETS', () => {
    process.env.INSTANA_SECRETS = 'unknown-matcher:nope,never';
    const config = normalizeConfig();
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
    expect(config.secrets.keywords).to.deep.equal(['nope', 'never']);
  });

  it('should accept packageJsonPath', () => {
    const config = normalizeConfig({ packageJsonPath: './something' });
    expect(config.packageJsonPath).to.equal('./something');
  });

  it('should not accept packageJsonPath', () => {
    const config = normalizeConfig({ packageJsonPath: 1234 });
    expect(config.packageJsonPath).to.not.exist;
  });

  it('should accept INSTANA_PACKAGE_JSON_PATH', () => {
    process.env.INSTANA_PACKAGE_JSON_PATH = '/my/path';
    const config = normalizeConfig({});
    expect(config.packageJsonPath).to.equal('/my/path');
  });

  it('should disable allow root exit span if config is set to false', () => {
    const config = normalizeConfig({
      tracing: { allowRootExitSpan: false }
    });
    expect(config.tracing.allowRootExitSpan).to.equal(false);
  });

  it('should enable allow root exit span if config is set to true', () => {
    const config = normalizeConfig({
      tracing: { allowRootExitSpan: true }
    });
    expect(config.tracing.allowRootExitSpan).to.equal(true);
  });

  it('should disable allow root exit span if INSTANA_ALLOW_ROOT_EXIT_SPAN is not set', () => {
    process.env.INSTANA_ALLOW_ROOT_EXIT_SPAN = false;
    const config = normalizeConfig();
    expect(config.tracing.allowRootExitSpan).to.equal(false);
  });

  it('should enable allow root exit span if INSTANA_ALLOW_ROOT_EXIT_SPAN is set', () => {
    process.env.INSTANA_ALLOW_ROOT_EXIT_SPAN = true;
    const config = normalizeConfig();
    expect(config.tracing.allowRootExitSpan).to.equal(true);
  });
  it('should not set ignore endpoints tracers by default', () => {
    const config = normalizeConfig();
    expect(config.tracing.ignoreEndpoints).to.deep.equal({});
  });

  it('should apply ignore endpoints if the INSTANA_IGNORE_ENDPOINTS is set and valid', () => {
    process.env.INSTANA_IGNORE_ENDPOINTS = 'redis:get,set;';
    const config = normalizeConfig();

    expect(config.tracing.ignoreEndpoints).to.deep.equal({ redis: [{ methods: ['get', 'set'] }] });
  });

  it('should correctly parse INSTANA_IGNORE_ENDPOINTS containing multiple services and endpoints', () => {
    process.env.INSTANA_IGNORE_ENDPOINTS = 'redis:get,set; dynamodb:query';
    const config = normalizeConfig();
    expect(config.tracing.ignoreEndpoints).to.deep.equal({
      redis: [{ methods: ['get', 'set'] }],
      dynamodb: [{ methods: ['query'] }]
    });
  });

  it('should fallback to default if INSTANA_IGNORE_ENDPOINTS is set but has an invalid format', () => {
    process.env.INSTANA_IGNORE_ENDPOINTS = '"redis=get,set"';
    const config = normalizeConfig();
    expect(config.tracing.ignoreEndpoints).to.deep.equal({});
  });

  it('should apply ignore endpoints via config', () => {
    const config = normalizeConfig({
      tracing: {
        ignoreEndpoints: { redis: ['get'] }
      }
    });
    expect(config.tracing.ignoreEndpoints).to.deep.equal({ redis: [{ methods: ['get'] }] });
  });
  it('should apply multiple ignore endpoints via config', () => {
    const config = normalizeConfig({
      tracing: {
        ignoreEndpoints: { redis: ['GET', 'TYPE'] }
      }
    });
    expect(config.tracing.ignoreEndpoints).to.deep.equal({ redis: [{ methods: ['get', 'type'] }] });
  });
  it('should apply ignore endpoints via config for multiple packages', () => {
    const config = normalizeConfig({
      tracing: {
        ignoreEndpoints: { redis: ['get'], dynamodb: ['querey'] }
      }
    });
    expect(config.tracing.ignoreEndpoints).to.deep.equal({
      redis: [{ methods: ['get'] }],
      dynamodb: [{ methods: ['querey'] }]
    });
  });

  it('should normalize case and trim spaces in method names and endpoint paths', () => {
    const config = normalizeConfig({
      tracing: {
        ignoreEndpoints: {
          redis: ['  GET ', 'TyPe'],
          kafka: [{ methods: ['  PUBLISH  '], endpoints: [' Topic1 ', 'TOPIC2 '] }]
        }
      }
    });
    expect(config.tracing.ignoreEndpoints).to.deep.equal({
      redis: [{ methods: ['get', 'type'] }],
      kafka: [{ methods: ['publish'], endpoints: ['topic1', 'topic2'] }]
    });
  });

  it('should return an empty list if all configurations are invalid', () => {
    const config = normalizeConfig({
      tracing: {
        ignoreEndpoints: { redis: {}, kafka: true, mysql: null }
      }
    });
    expect(config.tracing.ignoreEndpoints).to.deep.equal({
      redis: [],
      kafka: [],
      mysql: []
    });
  });

  it('should normalize objects when unsupported additional fields applied', () => {
    const config = normalizeConfig({
      tracing: {
        ignoreEndpoints: {
          redis: [{ extra: 'data' }],
          kafka: [{ methods: ['publish'], extra: 'info' }]
        }
      }
    });
    expect(config.tracing.ignoreEndpoints).to.deep.equal({
      redis: [],
      kafka: [{ methods: ['publish'] }]
    });
  });

  it('should normalize objects with only methods and no endpoints', () => {
    const config = normalizeConfig({
      tracing: {
        ignoreEndpoints: {
          kafka: [{ methods: ['PUBLISH'] }]
        }
      }
    });
    expect(config.tracing.ignoreEndpoints).to.deep.equal({
      kafka: [{ methods: ['publish'] }]
    });
  });

  it('should normalize objects with only endpoints and no methods', () => {
    const config = normalizeConfig({
      tracing: {
        ignoreEndpoints: {
          kafka: [{ endpoints: ['Topic1'] }]
        }
      }
    });
    expect(config.tracing.ignoreEndpoints).to.deep.equal({
      kafka: [{ endpoints: ['topic1'] }]
    });
  });

  it('should normalize objects where methods or endpoints are invalid types', () => {
    const config = normalizeConfig({
      tracing: {
        ignoreEndpoints: {
          kafka: [{ methods: 123, endpoints: 'invalid' }]
        }
      }
    });
    expect(config.tracing.ignoreEndpoints).to.deep.equal({});
  });

  describe('when testing ignore endpoints reading from INSTANA_IGNORE_ENDPOINTS_PATH env variable', () => {
    let filePaths;

    before(() => {
      filePaths = setupTestYamlFiles(__dirname);
    });

    after(() => {
      cleanupTestYamlFiles(filePaths);
    });

    it('should normalize YAML with "tracing" key', () => {
      process.env.INSTANA_IGNORE_ENDPOINTS_PATH = filePaths.tracingYamlPath;
      const config = normalizeConfig();
      expect(config.tracing.ignoreEndpoints).to.deep.equal({
        kafka: [{ methods: ['consume', 'publish'], endpoints: ['topic1', 'topic2'] }]
      });
    });

    it('should normalize YAML with "com.instana.tracing" key', () => {
      process.env.INSTANA_IGNORE_ENDPOINTS_PATH = filePaths.comInstanaTracingYamlPath;
      const config = normalizeConfig();
      expect(config.tracing.ignoreEndpoints).to.deep.equal({
        kafka: [{ methods: ['consume', 'publish'], endpoints: ['topic1', 'topic2'] }]
      });
    });

    it('should return an empty object for invalid YAML content', () => {
      process.env.INSTANA_IGNORE_ENDPOINTS_PATH = filePaths.invalidYamlPath;
      const config = normalizeConfig();
      expect(config.tracing.ignoreEndpoints).to.deep.equal({});
    });

    it('should return an empty object for YAML with missing root keys', () => {
      process.env.INSTANA_IGNORE_ENDPOINTS_PATH = filePaths.missingRootKeyYamlPath;
      const config = normalizeConfig();
      expect(config.tracing.ignoreEndpoints).to.deep.equal({});
    });

    it('should return false when INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION is not set', () => {
      const config = normalizeConfig();
      expect(config.tracing.ignoreEndpointsDisableSuppression).to.deep.equal(false);
    });

    it('should return true when INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION is set', () => {
      process.env.INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION = true;
      const config = normalizeConfig();
      expect(config.tracing.ignoreEndpointsDisableSuppression).to.deep.equal(true);
    });
  });

  function checkDefaults(config) {
    expect(config).to.be.an('object');

    expect(config.serviceName).to.not.exist;
    expect(config.packageJsonPath).to.not.exist;

    expect(config.metrics).to.be.an('object');
    expect(config.metrics.transmissionDelay).to.equal(1000);
    expect(config.metrics.timeBetweenHealthcheckCalls).to.equal(3000);

    expect(config.tracing).to.be.an('object');
    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.automaticTracingEnabled).to.be.true;
    expect(config.tracing.activateImmediately).to.be.false;
    expect(config.tracing.transmissionDelay).to.equal(1000);
    expect(config.tracing.forceTransmissionStartingAt).to.equal(500);
    expect(config.tracing.maxBufferedSpans).to.equal(1000);
    expect(config.tracing.disable).to.deep.equal({});
    expect(config.tracing.http).to.be.an('object');
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.empty;
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.an('array');
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.empty;
    expect(config.tracing.http.extraHttpHeadersToCapture).to.be.empty;
    expect(config.tracing.stackTraceLength).to.equal(10);
    expect(config.tracing.spanBatchingEnabled).to.be.false;
    expect(config.tracing.disableW3cTraceCorrelation).to.be.false;
    expect(config.tracing.kafka.traceCorrelation).to.be.true;
    expect(config.tracing.useOpentelemetry).to.equal(true);
    expect(config.tracing.allowRootExitSpan).to.equal(false);

    expect(config.secrets).to.be.an('object');
    expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
    expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
  }

  function setupTestYamlFiles(dirname) {
    const tracingYamlPath = path.resolve(dirname, 'tracing.yaml');
    const comInstanaTracingYamlPath = path.resolve(dirname, 'comInstanaTracing.yaml');
    const invalidYamlPath = path.resolve(dirname, 'invalid.yaml');
    const missingRootKeyYamlPath = path.resolve(dirname, 'missingRootKey.yaml');

    [tracingYamlPath, comInstanaTracingYamlPath, invalidYamlPath, missingRootKeyYamlPath].forEach(filePath => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    fs.writeFileSync(
      tracingYamlPath,
      `tracing:
      ignore-endpoints:
        kafka: 
          - methods: ["consume","publish"]
            endpoints: ["topic1","topic2"]`
    );

    fs.writeFileSync(
      comInstanaTracingYamlPath,
      `com.instana.tracing:
      ignore-endpoints:
        kafka: 
          - methods: ["consume","publish"]
            endpoints: ["topic1","topic2"]`
    );

    fs.writeFileSync(invalidYamlPath, 'mytest.json');
    fs.writeFileSync(missingRootKeyYamlPath, 'instana: test');

    return {
      tracingYamlPath,
      comInstanaTracingYamlPath,
      invalidYamlPath,
      missingRootKeyYamlPath
    };
  }

  function cleanupTestYamlFiles(filePaths) {
    Object.values(filePaths).forEach(filePath => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  }
});
