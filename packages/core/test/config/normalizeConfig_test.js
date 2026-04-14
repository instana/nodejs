/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;
const fs = require('fs');
const path = require('path');
const { createFakeLogger } = require('../test_util');
const coreConfig = require('../../src/config');

describe('config.normalizeConfig', () => {
  before(() => {
    coreConfig.init(createFakeLogger());
  });

  beforeEach(resetEnv);
  afterEach(resetEnv);

  function resetEnv() {
    delete process.env.INSTANA_TRACING_DISABLE;
    delete process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS;
    delete process.env.INSTANA_TRACING_DISABLE_GROUPS;
    delete process.env.INSTANA_TRACING_DISABLE_EOL_EVENTS;
    delete process.env.INSTANA_DISABLE_AUTO_INSTR;
    delete process.env.INSTANA_TRACE_IMMEDIATELY;
    delete process.env.INSTANA_EXTRA_HTTP_HEADERS;
    delete process.env.INSTANA_FORCE_TRANSMISSION_STARTING_AT;
    delete process.env.INSTANA_METRICS_TRANSMISSION_DELAY;
    delete process.env.INSTANA_SECRETS;
    delete process.env.INSTANA_SERVICE_NAME;
    delete process.env.INSTANA_STACK_TRACE;
    delete process.env.INSTANA_STACK_TRACE_LENGTH;
    delete process.env.INSTANA_TRACING_TRANSMISSION_DELAY;
    delete process.env.INSTANA_TRACING_INITIAL_TRANSMISSION_DELAY;
    delete process.env.INSTANA_SPANBATCHING_ENABLED;
    delete process.env.INSTANA_DISABLE_SPANBATCHING;
    delete process.env.INSTANA_DISABLE_W3C_TRACE_CORRELATION;
    delete process.env.INSTANA_DISABLE_USE_OPENTELEMETRY;
    delete process.env.INSTANA_KAFKA_TRACE_CORRELATION;
    delete process.env.INSTANA_PACKAGE_JSON_PATH;
    delete process.env.INSTANA_ALLOW_ROOT_EXIT_SPAN;
    delete process.env.INSTANA_IGNORE_ENDPOINTS;
    delete process.env.INSTANA_IGNORE_ENDPOINTS_PATH;
    delete process.env.INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION;
  }

  describe('default configuration', () => {
    it('should apply all defaults', () => {
      checkDefaults(coreConfig.normalize());
      checkDefaults(coreConfig.normalize({ userConfig: { userConfig: {} } }));
      checkDefaults(coreConfig.normalize({ userConfig: { userConfig: { tracing: {}, metrics: {} } } }));
      checkDefaults(coreConfig.normalize({ userConfig: { userConfig: { unknowConfigOption: 13 } } }));
    });
  });

  describe('service name configuration', () => {
    it('should accept service name', () => {
      const config = coreConfig.normalize({ userConfig: { serviceName: 'custom-service-name' } });
      expect(config.serviceName).to.equal('custom-service-name');
    });

    it('should accept agent service name', () => {
      const config = coreConfig.normalize({});
      coreConfig.update({
        finalConfig: config,
        externalConfig: {
          serviceName: 'agent-service-name',
          transmissionDelay: 5000
        },
        sourceName: 'AGENT'
      });
      expect(config.serviceName).to.equal('agent-service-name');
    });
    it('should accept service name from env var', () => {
      process.env.INSTANA_SERVICE_NAME = 'very-custom-service-name';
      const config = coreConfig.normalize();
      expect(config.serviceName).to.equal('very-custom-service-name');
    });

    it('should not accept non-string service name', () => {
      const config = coreConfig.normalize({ userConfig: { serviceName: 42 } });
      expect(config.serviceName).to.not.exist;
    });

    it('should use config when env not set', () => {
      const config = coreConfig.normalize({ userConfig: { serviceName: 'config-service-name' } });
      expect(config.serviceName).to.equal('config-service-name');
    });

    it('should give precedence to INSTANA_SERVICE_NAME env var over config', () => {
      process.env.INSTANA_SERVICE_NAME = 'env-service';
      const config = coreConfig.normalize({ userConfig: { serviceName: 'config-service' } });
      expect(config.serviceName).to.equal('env-service');
    });
  });

  describe('metrics configuration', () => {
    it('should use custom metrics transmission settings from config', () => {
      const config = coreConfig.normalize({
        userConfig: {
          metrics: {
            transmissionDelay: 9753
          }
        }
      });
      expect(config.metrics.transmissionDelay).to.equal(9753);
    });

    it('should use custom metrics transmission settings from env vars', () => {
      process.env.INSTANA_METRICS_TRANSMISSION_DELAY = '2500';
      const config = coreConfig.normalize();
      expect(config.metrics.transmissionDelay).to.equal(2500);
    });

    it('should use default metrics transmission settings when env vars are non-numerical', () => {
      process.env.INSTANA_METRICS_TRANSMISSION_DELAY = 'x2500';
      const config = coreConfig.normalize();
      expect(config.metrics.transmissionDelay).to.equal(1000);
    });

    it('should use default (1000) for transmissionDelay when neither env nor config is set', () => {
      const config = coreConfig.normalize({});
      expect(config.metrics.transmissionDelay).to.equal(1000);
    });

    it('should give precedence to INSTANA_METRICS_TRANSMISSION_DELAY env var over config', () => {
      process.env.INSTANA_METRICS_TRANSMISSION_DELAY = '3000';
      const config = coreConfig.normalize({ userConfig: { metrics: { transmissionDelay: 5000 } } });
      expect(config.metrics.transmissionDelay).to.equal(3000);
    });

    it('should fall back to config when env var is invalid', () => {
      process.env.INSTANA_METRICS_TRANSMISSION_DELAY = 'invalid';
      const config = coreConfig.normalize({ userConfig: { metrics: { transmissionDelay: 5000 } } });
      expect(config.metrics.transmissionDelay).to.equal(5000);
    });

    it('should fall back to default when both env and config are invalid', () => {
      process.env.INSTANA_METRICS_TRANSMISSION_DELAY = 'invalid';
      const config = coreConfig.normalize({ userConfig: { metrics: { transmissionDelay: 'also-invalid' } } });
      expect(config.metrics.transmissionDelay).to.equal(1000);
    });

    it('should use custom config.metrics.timeBetweenHealthcheckCalls', () => {
      const config = coreConfig.normalize({
        userConfig: {
          metrics: {
            timeBetweenHealthcheckCalls: 9876
          }
        }
      });
      expect(config.metrics.timeBetweenHealthcheckCalls).to.equal(9876);
    });
  });

  describe('tracing configuration', () => {
    describe('enabling and disabling tracing', () => {
      it('should disable tracing with enabled: false', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { enabled: false } } });
        expect(config.tracing.enabled).to.be.false;
        expect(config.tracing.automaticTracingEnabled).to.be.false;
      });

      it('should disable tracing with disable: true', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { enabled: false } } });
        expect(config.tracing.enabled).to.be.false;
        expect(config.tracing.automaticTracingEnabled).to.be.false;
      });

      it('should disable automatic tracing', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { automaticTracingEnabled: false } } });
        expect(config.tracing.enabled).to.be.true;
        expect(config.tracing.automaticTracingEnabled).to.be.false;
      });

      it('should disable automatic tracing via INSTANA_DISABLE_AUTO_INSTR', () => {
        process.env.INSTANA_DISABLE_AUTO_INSTR = 'true';
        const config = coreConfig.normalize();
        expect(config.tracing.enabled).to.be.true;
        expect(config.tracing.automaticTracingEnabled).to.be.false;
      });
      it('should not enable automatic tracing when tracing is disabled in general', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              enabled: false,
              automaticTracingEnabled: true
            }
          }
        });
        expect(config.tracing.enabled).to.be.false;
        expect(config.tracing.automaticTracingEnabled).to.be.false;
      });

      it('should use default (true) for tracing.enabled when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.tracing.enabled).to.be.true;
      });

      it('should give precedence to INSTANA_TRACING_DISABLE env var set to true over config set to true', () => {
        process.env.INSTANA_TRACING_DISABLE = 'true';
        const config = coreConfig.normalize({ userConfig: { tracing: { enabled: true } } });
        expect(config.tracing.enabled).to.be.false;
      });

      it('should give precedence to INSTANA_TRACING_DISABLE env var set to false over config set to false', () => {
        process.env.INSTANA_TRACING_DISABLE = 'false';
        const config = coreConfig.normalize({ userConfig: { tracing: { enabled: false } } });
        expect(config.tracing.enabled).to.be.true;
      });

      it('should give precedence to INSTANA_TRACING_DISABLE env var over default', () => {
        process.env.INSTANA_TRACING_DISABLE = 'true';
        const config = coreConfig.normalize({});
        expect(config.tracing.enabled).to.be.false;
      });

      it('should use default (true) for automaticTracingEnabled when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.tracing.automaticTracingEnabled).to.be.true;
      });

      it('should give precedence to INSTANA_DISABLE_AUTO_INSTR env var set to true over config set to true', () => {
        process.env.INSTANA_DISABLE_AUTO_INSTR = 'true';
        const config = coreConfig.normalize({ userConfig: { tracing: { automaticTracingEnabled: true } } });
        expect(config.tracing.automaticTracingEnabled).to.be.false;
      });

      it('should give precedence to INSTANA_DISABLE_AUTO_INSTR env var set to false over config set to false', () => {
        process.env.INSTANA_DISABLE_AUTO_INSTR = 'false';
        const config = coreConfig.normalize({ userConfig: { tracing: { automaticTracingEnabled: false } } });
        expect(config.tracing.automaticTracingEnabled).to.be.true;
      });

      it('should give precedence to INSTANA_DISABLE_AUTO_INSTR env var over default', () => {
        process.env.INSTANA_DISABLE_AUTO_INSTR = 'true';
        const config = coreConfig.normalize({});
        expect(config.tracing.automaticTracingEnabled).to.be.false;
      });
    });

    describe('immediate activation', () => {
      it('should enable immediate tracing activation', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { activateImmediately: true } } });
        expect(config.tracing.activateImmediately).to.be.true;
      });

      it('should enable immediate tracing activation via INSTANA_TRACE_IMMEDIATELY', () => {
        process.env.INSTANA_TRACE_IMMEDIATELY = 'true';
        const config = coreConfig.normalize();
        expect(config.tracing.activateImmediately).to.be.true;
      });

      it('should not enable immediate tracing activation when tracing is disabled in general', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              enabled: false,
              activateImmediately: true
            }
          }
        });
        expect(config.tracing.enabled).to.be.false;
        expect(config.tracing.activateImmediately).to.be.false;
      });

      it('should use default (false) for activateImmediately when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.tracing.activateImmediately).to.be.false;
      });

      it('should give precedence to INSTANA_TRACE_IMMEDIATELY env var set to true over config set to false', () => {
        process.env.INSTANA_TRACE_IMMEDIATELY = 'true';
        const config = coreConfig.normalize({ userConfig: { tracing: { activateImmediately: false } } });
        expect(config.tracing.activateImmediately).to.be.true;
      });

      it('should give precedence to INSTANA_TRACE_IMMEDIATELY env var set to false over config set to true', () => {
        process.env.INSTANA_TRACE_IMMEDIATELY = 'false';
        const config = coreConfig.normalize({ userConfig: { tracing: { activateImmediately: true } } });
        expect(config.tracing.activateImmediately).to.be.false;
      });
    });

    describe('transmission settings', () => {
      it('should use custom tracing transmission settings from config', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              maxBufferedSpans: 13,
              forceTransmissionStartingAt: 2,
              transmissionDelay: 9753
            }
          }
        });
        expect(config.tracing.maxBufferedSpans).to.equal(13);
        expect(config.tracing.forceTransmissionStartingAt).to.equal(2);
        expect(config.tracing.transmissionDelay).to.equal(9753);
      });

      it('should use custom tracing transmission settings from env vars', () => {
        process.env.INSTANA_FORCE_TRANSMISSION_STARTING_AT = '2468';
        process.env.INSTANA_TRACING_TRANSMISSION_DELAY = '2500';
        const config = coreConfig.normalize();
        expect(config.tracing.forceTransmissionStartingAt).to.equal(2468);
        expect(config.tracing.transmissionDelay).to.equal(2500);
      });

      it('should use default tracing transmission settings when env vars are non-numerical', () => {
        process.env.INSTANA_FORCE_TRANSMISSION_STARTING_AT = 'a2468';
        process.env.INSTANA_TRACING_TRANSMISSION_DELAY = 'x2500';
        const config = coreConfig.normalize();
        expect(config.tracing.forceTransmissionStartingAt).to.equal(500);
        expect(config.tracing.transmissionDelay).to.equal(1000);
      });

      it('should give precedence to INSTANA_TRACING_TRANSMISSION_DELAY env var over config', () => {
        process.env.INSTANA_TRACING_TRANSMISSION_DELAY = '4000';
        const config = coreConfig.normalize({ userConfig: { tracing: { transmissionDelay: 2000 } } });
        expect(config.tracing.transmissionDelay).to.equal(4000);
      });

      it('should give precedence to INSTANA_FORCE_TRANSMISSION_STARTING_AT env var over config', () => {
        process.env.INSTANA_FORCE_TRANSMISSION_STARTING_AT = '700';
        const config = coreConfig.normalize({ userConfig: { tracing: { forceTransmissionStartingAt: 300 } } });
        expect(config.tracing.forceTransmissionStartingAt).to.equal(700);
      });

      it('should fall back to config when env var is invalid for transmissionDelay', () => {
        process.env.INSTANA_TRACING_TRANSMISSION_DELAY = 'invalid';
        const config = coreConfig.normalize({ userConfig: { tracing: { transmissionDelay: 5000 } } });
        expect(config.tracing.transmissionDelay).to.equal(5000);
      });

      it('should fall back to default when both env and config are invalid for transmissionDelay', () => {
        process.env.INSTANA_TRACING_TRANSMISSION_DELAY = 'invalid';
        const config = coreConfig.normalize({ userConfig: { tracing: { transmissionDelay: 'also-invalid' } } });
        expect(config.tracing.transmissionDelay).to.equal(1000);
      });
    });

    describe('HTTP headers configuration', () => {
      it('should use extra http headers (and normalize to lower case)', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              http: {
                extraHttpHeadersToCapture: ['yo', 'LO']
              }
            }
          }
        });
        expect(config.tracing.http.extraHttpHeadersToCapture).to.deep.equal(['yo', 'lo']);
      });

      it('should reject non-array extra http headers configuration value', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              http: {
                extraHttpHeadersToCapture: 'yolo'
              }
            }
          }
        });
        expect(config.tracing.http.extraHttpHeadersToCapture).to.be.an('array');
        expect(config.tracing.http.extraHttpHeadersToCapture).to.be.empty;
      });

      it('should parse extra headers from env var', () => {
        process.env.INSTANA_EXTRA_HTTP_HEADERS = ' X-Header-1 ; X-hEADer-2 , X-Whatever ';
        const config = coreConfig.normalize();
        expect(config.tracing.http.extraHttpHeadersToCapture).to.deep.equal(['x-header-1', 'x-header-2', 'x-whatever']);
      });

      it('must use default extra headers (empty list) when INSTANA_EXTRA_HTTP_HEADERS is invalid', () => {
        process.env.INSTANA_EXTRA_HTTP_HEADERS = ' \n \t ';
        const config = coreConfig.normalize();
        expect(config.tracing.http.extraHttpHeadersToCapture).to.deep.equal([]);
      });
    });

    describe('stack trace configuration', () => {
      it('should accept numerical custom stack trace length', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: 666 } } });
        expect(config.tracing.stackTraceLength).to.equal(500);
      });
      it('should normalize numbers for custom stack trace length', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: -28.08 } } });

        expect(config.tracing.stackTraceLength).to.be.a('number');
        expect(config.tracing.stackTraceLength).to.equal(28);
      });

      it('should accept number-like strings for custom stack trace length', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: '1302' } } });
        expect(config.tracing.stackTraceLength).to.be.a('number');
        expect(config.tracing.stackTraceLength).to.equal(500);
      });

      it('should normalize number-like strings for custom stack trace length', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: '-16.04' } } });
        expect(config.tracing.stackTraceLength).to.be.a('number');
        expect(config.tracing.stackTraceLength).to.equal(16);
      });

      it('should reject non-numerical strings for custom stack trace length', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: 'three' } } });
        expect(config.tracing.stackTraceLength).to.be.a('number');
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should reject custom stack trace length which is neither a number nor a string', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: false } } });
        expect(config.tracing.stackTraceLength).to.be.a('number');
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should read stack trace length from INSTANA_STACK_TRACE_LENGTH', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '3';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(3);
      });

      it('should give precedence to INSTANA_STACK_TRACE_LENGTH over config', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '5';
        const normalizedConfig = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: 20 } } });
        expect(normalizedConfig.tracing.stackTraceLength).to.equal(5);
        delete process.env.INSTANA_STACK_TRACE_LENGTH;
      });

      it('should use default stack trace mode', () => {
        const config = coreConfig.normalize();
        expect(config.tracing.stackTrace).to.equal('all');
      });

      it('should accept valid stack trace mode from config', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: 'error' } } } });
        expect(config.tracing.stackTrace).to.equal('error');
      });

      it('should accept "none" stack trace mode from config', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: 'none' } } } });
        expect(config.tracing.stackTrace).to.equal('none');
      });

      it('should normalize stack trace mode to lowercase from config', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: 'ERROR' } } } });
        expect(config.tracing.stackTrace).to.equal('error');
      });

      it('should read stack trace mode from INSTANA_STACK_TRACE', () => {
        process.env.INSTANA_STACK_TRACE = 'error';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTrace).to.equal('error');
      });

      it('should normalize stack trace mode to lowercase from INSTANA_STACK_TRACE', () => {
        process.env.INSTANA_STACK_TRACE = 'NONE';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTrace).to.equal('none');
      });

      it('should give precedence to env INSTANA_STACK_TRACE over config', () => {
        process.env.INSTANA_STACK_TRACE = 'none';
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: 'all' } } } });
        expect(config.tracing.stackTrace).to.equal('none');
      });

      it('should reject invalid stack trace mode from config and fallback to default', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: 'invalid' } } } });
        expect(config.tracing.stackTrace).to.equal('all');
      });

      it('should reject invalid stack trace mode from INSTANA_STACK_TRACE and use default', () => {
        process.env.INSTANA_STACK_TRACE = 'invalid';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTrace).to.equal('all');
      });

      it('should reject non-string stack trace mode from config', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: 123 } } } });
        expect(config.tracing.stackTrace).to.equal('all');
      });

      it('should handle null stack trace mode from config', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: null } } } });
        expect(config.tracing.stackTrace).to.equal('all');
      });

      it('should handle undefined stack trace mode from config', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: undefined } } } });
        expect(config.tracing.stackTrace).to.equal('all');
      });

      it('should handle empty string stack trace mode from config', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: '' } } } });
        expect(config.tracing.stackTrace).to.equal('all');
      });

      it('should handle boolean stack trace mode from config', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: true } } } });
        expect(config.tracing.stackTrace).to.equal('all');
      });

      it('should handle object stack trace mode from config', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: {} } } } });
        expect(config.tracing.stackTrace).to.equal('all');
      });

      it('should handle array stack trace mode from config', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: ['error'] } } } });
        expect(config.tracing.stackTrace).to.equal('all');
      });

      it('should accept zero as valid stack trace length', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: 0 } } });
        expect(config.tracing.stackTraceLength).to.equal(0);
      });

      it('should handle negative stack trace length', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: -10 } } });
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should handle very large negative stack trace length', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: -100 } } });
        expect(config.tracing.stackTraceLength).to.equal(100);
      });

      it('should handle stack trace length as positive float', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: 15.9 } } });
        expect(config.tracing.stackTraceLength).to.equal(16);
      });

      it('should handle stack trace length as negative float', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: -15.9 } } });
        expect(config.tracing.stackTraceLength).to.equal(16);
      });

      it('should handle stack trace length as string with leading zeros', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: '007' } } });
        expect(config.tracing.stackTraceLength).to.equal(7);
      });

      it('should handle stack trace length as string with whitespace', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: '  25  ' } } });
        expect(config.tracing.stackTraceLength).to.equal(25);
      });

      it('should handle stack trace length as string with plus sign', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: '+30' } } });
        expect(config.tracing.stackTraceLength).to.equal(30);
      });

      it('should reject stack trace length as null', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: null } } });
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should reject stack trace length as undefined', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: undefined } } });
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should reject stack trace length as empty string', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: '' } } });
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should reject stack trace length as object', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: {} } } });
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should reject stack trace length as array', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { stackTraceLength: [10] } } });
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should handle stack trace length from INSTANA_STACK_TRACE_LENGTH as zero', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '0';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(0);
      });

      it('should handle stack trace length from INSTANA_STACK_TRACE_LENGTH with negative value', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '-20';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(20);
      });

      it('should handle stack trace length from INSTANA_STACK_TRACE_LENGTH exceeding max', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '1000';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(500);
      });

      it('should handle stack trace length from INSTANA_STACK_TRACE_LENGTH as float', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '12.3';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(12);
      });

      it('should reject invalid INSTANA_STACK_TRACE_LENGTH', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = 'not-a-number';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should reject empty INSTANA_STACK_TRACE_LENGTH', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should use default when INSTANA_STACK_TRACE passes validation but normalizer returns null', () => {
        const stackTraceNormalizers = require('../../src/config/configNormalizers/stackTrace');
        const original = stackTraceNormalizers.normalizeStackTraceModeFromEnv;
        stackTraceNormalizers.normalizeStackTraceModeFromEnv = () => null;

        process.env.INSTANA_STACK_TRACE = 'all';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTrace).to.equal('all');

        stackTraceNormalizers.normalizeStackTraceModeFromEnv = original;
      });

      it('should use default when config stackTrace passes validation but normalizer returns null', () => {
        const stackTraceNormalizers = require('../../src/config/configNormalizers/stackTrace');
        const original = stackTraceNormalizers.normalizeStackTraceMode;
        stackTraceNormalizers.normalizeStackTraceMode = () => null;

        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTrace: 'all' } } } });
        expect(config.tracing.stackTrace).to.equal('all');

        stackTraceNormalizers.normalizeStackTraceMode = original;
      });

      it('should use default when INSTANA_STACK_TRACE_LENGTH passes validation but normalizer returns null', () => {
        const stackTraceNormalizers = require('../../src/config/configNormalizers/stackTrace');
        const original = stackTraceNormalizers.normalizeStackTraceLengthFromEnv;
        stackTraceNormalizers.normalizeStackTraceLengthFromEnv = () => null;

        process.env.INSTANA_STACK_TRACE_LENGTH = '10';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(10);

        stackTraceNormalizers.normalizeStackTraceLengthFromEnv = original;
      });

      it('should use default when config stackTraceLength passes validation but normalizer returns null', () => {
        const stackTraceNormalizers = require('../../src/config/configNormalizers/stackTrace');
        const original = stackTraceNormalizers.normalizeStackTraceLength;
        stackTraceNormalizers.normalizeStackTraceLength = () => null;

        const config = coreConfig.normalize({ userConfig: { tracing: { global: { stackTraceLength: 20 } } } });
        expect(config.tracing.stackTraceLength).to.equal(10);

        stackTraceNormalizers.normalizeStackTraceLength = original;
      });

      it('should reject INSTANA_STACK_TRACE_LENGTH with only whitespace', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '   ';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should handle INSTANA_STACK_TRACE_LENGTH with mixed valid and invalid characters', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '15abc';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(15);
      });

      it('should return null from normalizeStackTraceLength when value is valid but normalized is null', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              global: {
                stackTraceLength: Infinity
              }
            }
          }
        });
        expect(config.tracing.stackTraceLength).to.equal(10);
      });

      it('should handle both INSTANA_STACK_TRACE and INSTANA_STACK_TRACE_LENGTH together', () => {
        process.env.INSTANA_STACK_TRACE = 'error';
        process.env.INSTANA_STACK_TRACE_LENGTH = '25';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTrace).to.equal('error');
        expect(config.tracing.stackTraceLength).to.equal(25);
      });

      it('should handle config with both stackTrace and stackTraceLength', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              global: {
                stackTrace: 'none',
                stackTraceLength: 30
              }
            }
          }
        });
        expect(config.tracing.stackTrace).to.equal('none');
        expect(config.tracing.stackTraceLength).to.equal(30);
      });

      it('should give precedence to env vars for both stack trace settings over config', () => {
        process.env.INSTANA_STACK_TRACE = 'error';
        process.env.INSTANA_STACK_TRACE_LENGTH = '15';
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              global: {
                stackTrace: 'all',
                stackTraceLength: 40
              }
            }
          }
        });
        expect(config.tracing.stackTrace).to.equal('error');
        expect(config.tracing.stackTraceLength).to.equal(15);
      });

      it('should use INSTANA_STACK_TRACE_LENGTH when STACK_TRACE_LENGTH is not set', () => {
        process.env.INSTANA_STACK_TRACE_LENGTH = '18';
        const config = coreConfig.normalize();
        expect(config.tracing.stackTraceLength).to.equal(18);
        delete process.env.INSTANA_STACK_TRACE_LENGTH;
      });
    });

    describe('disabling instrumentations and groups', () => {
      it('should not disable individual instrumentations by default', () => {
        const config = coreConfig.normalize();
        expect(config.tracing.disable).to.deep.equal({});
      });
      it('should disable individual instrumentations via disable config', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              disable: ['graphQL', 'GRPC']
            }
          }
        });
        expect(config.tracing.disable.instrumentations).to.deep.equal(['graphql', 'grpc']);
      });

      it('should disable individual instrumentations via disable.instrumentations config', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              disable: { instrumentations: ['graphQL', 'GRPC'] }
            }
          }
        });
        expect(config.tracing.disable.instrumentations).to.deep.equal(['graphql', 'grpc']);
      });

      it('env var INSTANA_TRACING_DISABLE_INSTRUMENTATIONS over config', () => {
        process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'foo, bar';
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              disable: { instrumentations: ['baz', 'fizz'] }
            }
          }
        });
        expect(config.tracing.disable.instrumentations).to.deep.equal(['foo', 'bar']);
      });

      it('should disable multiple instrumentations via env var INSTANA_TRACING_DISABLE_INSTRUMENTATIONS', () => {
        process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'graphQL   , GRPC, http';
        const config = coreConfig.normalize();
        expect(config.tracing.disable.instrumentations).to.deep.equal(['graphql', 'grpc', 'http']);
      });

      it('should handle single instrumentations via INSTANA_TRACING_DISABLE_INSTRUMENTATIONS', () => {
        process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'console';
        const config = coreConfig.normalize();
        expect(config.tracing.disable.instrumentations).to.deep.equal(['console']);
      });

      it('should trim whitespace from tracer names', () => {
        process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = '  graphql  ,  grpc  ';
        const config = coreConfig.normalize();
        expect(config.tracing.disable.instrumentations).to.deep.equal(['graphql', 'grpc']);
      });

      it('should disable individual groups via disable config', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              disable: { groups: ['logging'] }
            }
          }
        });
        expect(config.tracing.disable.groups).to.deep.equal(['logging']);
      });

      it('config should disable when env var INSTANA_TRACING_DISABLE_GROUPS is set', () => {
        process.env.INSTANA_TRACING_DISABLE_GROUPS = 'frameworks, databases';
        const config = coreConfig.normalize({});
        expect(config.tracing.disable.groups).to.deep.equal(['frameworks', 'databases']);
      });

      it('env var should take precedence over config when disabling groups', () => {
        process.env.INSTANA_TRACING_DISABLE_GROUPS = 'frameworks, databases';
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              disable: { groups: ['LOGGING'] }
            }
          }
        });
        expect(config.tracing.disable.groups).to.deep.equal(['frameworks', 'databases']);
      });

      it('should disable instrumentations and groups when both configured', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              disable: { groups: ['LOGGING'], instrumentations: ['redis', 'kafka'] }
            }
          }
        });
        expect(config.tracing.disable.groups).to.deep.equal(['logging']);
        expect(config.tracing.disable.instrumentations).to.deep.equal(['redis', 'kafka']);
      });

      it('should disable instrumentations and groups when both env variables provided', () => {
        process.env.INSTANA_TRACING_DISABLE_INSTRUMENTATIONS = 'redis';
        process.env.INSTANA_TRACING_DISABLE_GROUPS = 'logging';
        const config = coreConfig.normalize();
        expect(config.tracing.disable.instrumentations).to.deep.equal(['redis']);
        expect(config.tracing.disable.groups).to.deep.equal(['logging']);
      });

      it('should disable all tracing via INSTANA_TRACING_DISABLE', () => {
        process.env.INSTANA_TRACING_DISABLE = true;
        const config = coreConfig.normalize();
        expect(config.tracing.enabled).to.be.false;
        expect(config.tracing.disable).to.deep.equal({});
        expect(config.tracing.automaticTracingEnabled).to.be.false;
      });

      it('should disable all tracing via config tracing.disable', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              disable: true
            }
          }
        });
        expect(config.tracing.enabled).to.be.false;
        expect(config.tracing.disable).to.deep.equal({});
        expect(config.tracing.automaticTracingEnabled).to.be.false;
      });
    });

    describe('span batching', () => {
      // delete this test when we switch to opt-out
      it('should enable span batching via config in transition phase', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { spanBatchingEnabled: true } } });
        expect(config.tracing.spanBatchingEnabled).to.be.true;
      });

      // delete this test when we switch to opt-out
      it('should enable span batching via INSTANA_SPANBATCHING_ENABLED in transition phase', () => {
        process.env.INSTANA_SPANBATCHING_ENABLED = 'true';
        const config = coreConfig.normalize();
        expect(config.tracing.spanBatchingEnabled).to.be.true;
      });

      it('should ignore non-boolean span batching config value', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { spanBatchingEnabled: 73 } } });
        // test needs to be updated once we switch to opt-out
        expect(config.tracing.spanBatchingEnabled).to.be.false;
      });

      it('should disable span batching', () => {
        // test only becomes relevant once we switch to opt-out
        const config = coreConfig.normalize({ userConfig: { tracing: { spanBatchingEnabled: false } } });
        expect(config.tracing.spanBatchingEnabled).to.be.false;
      });

      it('should disable span batching via INSTANA_DISABLE_SPANBATCHING', () => {
        // test only becomes relevant once we switch to opt-out
        process.env.INSTANA_DISABLE_SPANBATCHING = 'true';
        const config = coreConfig.normalize();
        expect(config.tracing.spanBatchingEnabled).to.be.false;
      });

      it('should use default (false) for spanBatchingEnabled when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.tracing.spanBatchingEnabled).to.be.false;
      });

      it('should give precedence to INSTANA_SPANBATCHING_ENABLED env var set to true over config set to false', () => {
        process.env.INSTANA_SPANBATCHING_ENABLED = 'true';
        const config = coreConfig.normalize({ userConfig: { tracing: { spanBatchingEnabled: false } } });
        expect(config.tracing.spanBatchingEnabled).to.be.true;
      });

      it('should give precedence to INSTANA_SPANBATCHING_ENABLED env var set to false over config set to true', () => {
        process.env.INSTANA_SPANBATCHING_ENABLED = 'false';
        const config = coreConfig.normalize({ userConfig: { tracing: { spanBatchingEnabled: true } } });
        expect(config.tracing.spanBatchingEnabled).to.be.false;
      });
    });

    describe('W3C trace correlation', () => {
      it('should disable W3C trace correlation', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { disableW3cTraceCorrelation: true } } });
        expect(config.tracing.disableW3cTraceCorrelation).to.be.true;
      });

      it('should disable W3C trace correlation via INSTANA_DISABLE_W3C_TRACE_CORRELATION', () => {
        process.env.INSTANA_DISABLE_W3C_TRACE_CORRELATION = 'false'; // any non-empty string will disable, even "false"!
        const config = coreConfig.normalize();
        expect(config.tracing.disableW3cTraceCorrelation).to.be.true;
      });

      it('should use default (false) for disableW3cTraceCorrelation when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.tracing.disableW3cTraceCorrelation).to.be.false;
      });

      it('should give precedence to INSTANA_DISABLE_W3C_TRACE_CORRELATION env var over config (truthy env)', () => {
        process.env.INSTANA_DISABLE_W3C_TRACE_CORRELATION = 'any-value';
        const config = coreConfig.normalize({ userConfig: { tracing: { disableW3cTraceCorrelation: false } } });
        expect(config.tracing.disableW3cTraceCorrelation).to.be.true;
      });
    });

    describe('Kafka trace correlation', () => {
      it('should disable Kafka trace correlation', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { kafka: { traceCorrelation: false } } } });
        expect(config.tracing.kafka.traceCorrelation).to.be.false;
      });

      it('should disable Kafka trace correlation via INSTANA_KAFKA_TRACE_CORRELATION', () => {
        process.env.INSTANA_KAFKA_TRACE_CORRELATION = 'false';
        const config = coreConfig.normalize();
        expect(config.tracing.kafka.traceCorrelation).to.be.false;
      });

      it('should use default (true) for kafka.traceCorrelation when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.tracing.kafka.traceCorrelation).to.be.true;
      });

      it('should give precedence to INSTANA_KAFKA_TRACE_CORRELATION env var set to false over config set to true', () => {
        process.env.INSTANA_KAFKA_TRACE_CORRELATION = 'false';
        const config = coreConfig.normalize({ userConfig: { tracing: { kafka: { traceCorrelation: true } } } });
        expect(config.tracing.kafka.traceCorrelation).to.be.false;
      });

      it('should give precedence to INSTANA_KAFKA_TRACE_CORRELATION env var set to true over config set to false', () => {
        process.env.INSTANA_KAFKA_TRACE_CORRELATION = 'true';
        const config = coreConfig.normalize({ userConfig: { tracing: { kafka: { traceCorrelation: false } } } });
        expect(config.tracing.kafka.traceCorrelation).to.be.true;
      });
    });

    describe('OpenTelemetry configuration', () => {
      it('should disable opentelemetry if config is set', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: { useOpentelemetry: false }
          }
        });
        expect(config.tracing.useOpentelemetry).to.equal(false);
      });

      it('should enable opentelemetry if config is set', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: { useOpentelemetry: true }
          }
        });
        expect(config.tracing.useOpentelemetry).to.equal(true);
      });

      it('should disable opentelemetry if INSTANA_DISABLE_USE_OPENTELEMETRY is set', () => {
        process.env.INSTANA_DISABLE_USE_OPENTELEMETRY = 'true';
        const config = coreConfig.normalize();
        expect(config.tracing.useOpentelemetry).to.equal(false);
      });

      it('should enable opentelemetry if INSTANA_DISABLE_USE_OPENTELEMETRY is set', () => {
        process.env.INSTANA_DISABLE_USE_OPENTELEMETRY = 'false';
        const config = coreConfig.normalize();
        expect(config.tracing.useOpentelemetry).to.equal(true);
      });

      it('should use default (true) for useOpentelemetry when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.tracing.useOpentelemetry).to.be.true;
      });

      it('should give precedence to INSTANA_DISABLE_USE_OPENTELEMETRY env var set to true over config set to true', () => {
        process.env.INSTANA_DISABLE_USE_OPENTELEMETRY = 'true';
        const config = coreConfig.normalize({ userConfig: { tracing: { useOpentelemetry: true } } });
        expect(config.tracing.useOpentelemetry).to.be.false;
      });

      it('should give precedence to INSTANA_DISABLE_USE_OPENTELEMETRY env var set to false over config set to false', () => {
        process.env.INSTANA_DISABLE_USE_OPENTELEMETRY = 'false';
        const config = coreConfig.normalize({ userConfig: { tracing: { useOpentelemetry: false } } });
        expect(config.tracing.useOpentelemetry).to.be.true;
      });
    });

    describe('secrets configuration', () => {
      it('should accept custom secrets config', () => {
        const config = coreConfig.normalize({
          userConfig: {
            secrets: {
              matcherMode: 'equals',
              keywords: ['custom-secret', 'sheesh']
            }
          }
        });
        expect(config.secrets.matcherMode).to.equal('equals');
        expect(config.secrets.keywords).to.deep.equal(['custom-secret', 'sheesh']);
      });

      it("should set keywords to empty array for matcher mode 'none'", () => {
        const config = coreConfig.normalize({
          userConfig: {
            secrets: {
              matcherMode: 'none'
            }
          }
        });
        expect(config.secrets.matcherMode).to.equal('none');
        expect(config.secrets.keywords).to.deep.equal([]);
      });

      it('should reject non-string matcher mode', () => {
        const config = coreConfig.normalize({ userConfig: { secrets: { matcherMode: 43 } } });
        expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
        expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
      });

      it('should reject unknown matcher mode from config', () => {
        const config = coreConfig.normalize({ userConfig: { secrets: { matcherMode: 'whatever' } } });
        expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
        expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
      });

      it('should reject non-array keywords', () => {
        const config = coreConfig.normalize({ userConfig: { secrets: { keywords: 'yes' } } });
        expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
        expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
      });

      it('should parse secrets from env var', () => {
        process.env.INSTANA_SECRETS = ' eQuaLs-igNore-case  :  concealed  ,  hush  ';
        const config = coreConfig.normalize();
        expect(config.secrets.matcherMode).to.equal('equals-ignore-case');
        expect(config.secrets.keywords).to.deep.equal(['concealed', 'hush']);
      });

      it('must use default secrets when INSTANA_SECRETS is invalid', () => {
        process.env.INSTANA_SECRETS = 'whatever';
        const config = coreConfig.normalize();
        expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
        expect(config.secrets.keywords).to.deep.equal(['key', 'pass', 'secret']);
      });

      it("must accept INSTANA_SECRETS without secrets list if matcher mode is 'none'", () => {
        process.env.INSTANA_SECRETS = 'NONE';
        const config = coreConfig.normalize();
        expect(config.secrets.matcherMode).to.equal('none');
        expect(config.secrets.keywords).to.deep.equal([]);
      });

      it('should reject unknown matcher mode from INSTANA_SECRETS', () => {
        process.env.INSTANA_SECRETS = 'unknown-matcher:nope,never';
        const config = coreConfig.normalize();
        expect(config.secrets.matcherMode).to.equal('contains-ignore-case');
        expect(config.secrets.keywords).to.deep.equal(['nope', 'never']);
      });
    });

    describe('package.json path configuration', () => {
      it('should accept packageJsonPath', () => {
        const config = coreConfig.normalize({ userConfig: { packageJsonPath: './something' } });
        expect(config.packageJsonPath).to.equal('./something');
      });

      it('should not accept packageJsonPath', () => {
        const config = coreConfig.normalize({ userConfig: { packageJsonPath: 1234 } });
        expect(config.packageJsonPath).to.not.exist;
      });

      it('should accept INSTANA_PACKAGE_JSON_PATH', () => {
        process.env.INSTANA_PACKAGE_JSON_PATH = '/my/path';
        const config = coreConfig.normalize({});
        expect(config.packageJsonPath).to.equal('/my/path');
      });

      it('should use default (null) when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.packageJsonPath).to.be.null;
      });

      it('should give precedence to INSTANA_PACKAGE_JSON_PATH env var over config', () => {
        process.env.INSTANA_PACKAGE_JSON_PATH = '/env/path/package.json';
        const config = coreConfig.normalize({ userConfig: { packageJsonPath: '/config/path/package.json' } });
        expect(config.packageJsonPath).to.equal('/env/path/package.json');
      });
    });

    describe('allow root exit span', () => {
      it('should disable allow root exit span if config is set to false', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: { allowRootExitSpan: false }
          }
        });
        expect(config.tracing.allowRootExitSpan).to.equal(false);
      });

      it('should enable allow root exit span if config is set to true', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: { allowRootExitSpan: true }
          }
        });
        expect(config.tracing.allowRootExitSpan).to.equal(true);
      });
      it('should disable allow root exit span if INSTANA_ALLOW_ROOT_EXIT_SPAN is not set', () => {
        process.env.INSTANA_ALLOW_ROOT_EXIT_SPAN = false;
        const config = coreConfig.normalize();
        expect(config.tracing.allowRootExitSpan).to.equal(false);
      });

      it('should enable allow root exit span if INSTANA_ALLOW_ROOT_EXIT_SPAN is set to true', () => {
        process.env.INSTANA_ALLOW_ROOT_EXIT_SPAN = true;
        const config = coreConfig.normalize();
        expect(config.tracing.allowRootExitSpan).to.equal(true);
      });

      it('should use default (false) for allowRootExitSpan when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.tracing.allowRootExitSpan).to.be.false;
      });

      it('should give precedence to INSTANA_ALLOW_ROOT_EXIT_SPAN env var set to true over config set to false', () => {
        process.env.INSTANA_ALLOW_ROOT_EXIT_SPAN = 'true';
        const config = coreConfig.normalize({ userConfig: { tracing: { allowRootExitSpan: false } } });
        expect(config.tracing.allowRootExitSpan).to.be.true;
      });

      it('should give precedence to INSTANA_ALLOW_ROOT_EXIT_SPAN env var set to false over config set to true', () => {
        process.env.INSTANA_ALLOW_ROOT_EXIT_SPAN = 'false';
        const config = coreConfig.normalize({ userConfig: { tracing: { allowRootExitSpan: true } } });
        expect(config.tracing.allowRootExitSpan).to.be.false;
      });
    });

    describe('ignore endpoints configuration', () => {
      it('should not set ignore endpoints tracers by default', () => {
        const config = coreConfig.normalize();
        expect(config.tracing.ignoreEndpoints).to.deep.equal({});
      });

      it('should apply ignore endpoints if the INSTANA_IGNORE_ENDPOINTS is set and valid', () => {
        process.env.INSTANA_IGNORE_ENDPOINTS = 'redis:get,set;';
        const config = coreConfig.normalize();

        expect(config.tracing.ignoreEndpoints).to.deep.equal({ redis: [{ methods: ['get', 'set'] }] });
      });

      it('should correctly parse INSTANA_IGNORE_ENDPOINTS containing multiple services and endpoints', () => {
        process.env.INSTANA_IGNORE_ENDPOINTS = 'redis:get,set; dynamodb:query';
        const config = coreConfig.normalize();
        expect(config.tracing.ignoreEndpoints).to.deep.equal({
          redis: [{ methods: ['get', 'set'] }],
          dynamodb: [{ methods: ['query'] }]
        });
      });

      it('should fallback to default if INSTANA_IGNORE_ENDPOINTS is set but has an invalid format', () => {
        process.env.INSTANA_IGNORE_ENDPOINTS = '"redis=get,set"';
        const config = coreConfig.normalize();
        expect(config.tracing.ignoreEndpoints).to.deep.equal({});
      });

      it('should apply ignore endpoints via config', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: { redis: ['get'] }
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({ redis: [{ methods: ['get'] }] });
      });
      it('should apply multiple ignore endpoints via config', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: { redis: ['GET', 'TYPE'] }
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({ redis: [{ methods: ['get', 'type'] }] });
      });
      it('should apply ignore endpoints via config for multiple packages', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: { redis: ['get'], dynamodb: ['querey'] }
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({
          redis: [{ methods: ['get'] }],
          dynamodb: [{ methods: ['querey'] }]
        });
      });

      it('should normalize case and trim spaces in method names and endpoint paths', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: {
                redis: ['  GET ', 'TyPe'],
                kafka: [{ methods: ['  PUBLISH  '], endpoints: [' Topic1 ', 'TOPIC2 '] }]
              }
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({
          redis: [{ methods: ['get', 'type'] }],
          kafka: [{ methods: ['publish'], endpoints: ['topic1', 'topic2'] }]
        });
      });

      it('should return an empty list if all configurations are invalid', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: { redis: {}, kafka: true, mysql: null }
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({
          redis: [],
          kafka: [],
          mysql: []
        });
      });

      it('should normalize objects when unsupported additional fields applied', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: {
                redis: [{ extra: 'data' }],
                kafka: [{ methods: ['publish'], extra: 'info' }]
              }
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({
          redis: [],
          kafka: [{ methods: ['publish'] }]
        });
      });

      it('should normalize objects with only methods and no endpoints', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: {
                kafka: [{ methods: ['PUBLISH'] }]
              }
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({
          kafka: [{ methods: ['publish'] }]
        });
      });

      it('should normalize objects with only endpoints and no methods', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: {
                kafka: [{ endpoints: ['Topic1'] }]
              }
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({
          kafka: [{ endpoints: ['topic1'] }]
        });
      });

      it('should normalize objects where methods or endpoints are invalid types', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: {
                kafka: [{ methods: 123, endpoints: 'invalid' }]
              }
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({});
      });

      it('should handle ignoreEndpoints when config is an array instead of object', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: ['redis', 'kafka']
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({});
      });

      it('should handle ignoreEndpoints when config is a non-object type', () => {
        const config = coreConfig.normalize({
          userConfig: {
            tracing: {
              ignoreEndpoints: 'invalid-string'
            }
          }
        });
        expect(config.tracing.ignoreEndpoints).to.deep.equal({});
      });

      it('should return false when INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION is not set', () => {
        const config = coreConfig.normalize();
        expect(config.tracing.ignoreEndpointsDisableSuppression).to.equal(false);
      });

      it('should return true when INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION is set to true', () => {
        process.env.INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION = true;
        const config = coreConfig.normalize();
        expect(config.tracing.ignoreEndpointsDisableSuppression).to.equal(true);
      });

      it('should use default (false) for ignoreEndpointsDisableSuppression when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.tracing.ignoreEndpointsDisableSuppression).to.be.false;
      });

      it('should give precedence to INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION env var set to true over config set to false', () => {
        process.env.INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION = 'true';
        const config = coreConfig.normalize({ userConfig: { tracing: { ignoreEndpointsDisableSuppression: false } } });
        expect(config.tracing.ignoreEndpointsDisableSuppression).to.be.true;
      });

      it('should give precedence to INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION env var set to false over config set to true', () => {
        process.env.INSTANA_IGNORE_ENDPOINTS_DISABLE_SUPPRESSION = 'false';
        const config = coreConfig.normalize({ userConfig: { tracing: { ignoreEndpointsDisableSuppression: true } } });
        expect(config.tracing.ignoreEndpointsDisableSuppression).to.be.false;
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
          const config = coreConfig.normalize();
          expect(config.tracing.ignoreEndpoints).to.deep.equal({
            kafka: [{ methods: ['consume', 'publish'], endpoints: ['topic1', 'topic2'] }]
          });
        });

        it('should normalize YAML with "com.instana.tracing" key', () => {
          process.env.INSTANA_IGNORE_ENDPOINTS_PATH = filePaths.comInstanaTracingYamlPath;
          const config = coreConfig.normalize();
          expect(config.tracing.ignoreEndpoints).to.deep.equal({
            kafka: [{ methods: ['consume', 'publish'], endpoints: ['topic1', 'topic2'] }]
          });
        });

        it('should return an empty object for invalid YAML content', () => {
          process.env.INSTANA_IGNORE_ENDPOINTS_PATH = filePaths.invalidYamlPath;
          const config = coreConfig.normalize();
          expect(config.tracing.ignoreEndpoints).to.deep.equal({});
        });

        it('should return an empty object for YAML with missing root keys', () => {
          process.env.INSTANA_IGNORE_ENDPOINTS_PATH = filePaths.missingRootKeyYamlPath;
          const config = coreConfig.normalize();
          expect(config.tracing.ignoreEndpoints).to.deep.equal({});
        });
      });
    });

    describe('preloadOpentelemetry', () => {
      it('preloadOpentelemetry should default to false', () => {
        const config = coreConfig.normalize({});
        expect(config.preloadOpentelemetry).to.be.false;
      });

      it('preloadOpentelemetry should accept true value', () => {
        const config = coreConfig.normalize({
          userConfig: {
            preloadOpentelemetry: true
          }
        });
        expect(config.preloadOpentelemetry).to.be.true;
      });

      it('preloadOpentelemetry should work with custom defaults', () => {
        const customDefaults = {
          preloadOpentelemetry: true,
          tracing: {
            forceTransmissionStartingAt: 25
          }
        };
        const config = coreConfig.normalize({ defaultsOverride: customDefaults });
        expect(config.preloadOpentelemetry).to.be.true;
        expect(config.tracing.forceTransmissionStartingAt).to.equal(25);
      });
    });

    describe('EOL events configuration', () => {
      it('should return false when INSTANA_TRACING_DISABLE_EOL_EVENTS is set to false', () => {
        const config = coreConfig.normalize();
        expect(config.tracing.disableEOLEvents).to.equal(false);
      });

      it('should return true when INSTANA_TRACING_DISABLE_EOL_EVENTS is set to true', () => {
        process.env.INSTANA_TRACING_DISABLE_EOL_EVENTS = 'true';
        const config = coreConfig.normalize();
        expect(config.tracing.disableEOLEvents).to.equal(true);
      });

      it('should return false when INSTANA_TRACING_DISABLE_EOL_EVENTS is set to false', () => {
        process.env.INSTANA_TRACING_DISABLE_EOL_EVENTS = 'false';
        const config = coreConfig.normalize();
        expect(config.tracing.disableEOLEvents).to.equal(false);
      });
      it('should return false when INSTANA_TRACING_DISABLE_EOL_EVENTS is set to any other value', () => {
        process.env.INSTANA_TRACING_DISABLE_EOL_EVENTS = 'test';
        const config = coreConfig.normalize();
        expect(config.tracing.disableEOLEvents).to.equal(false);
      });

      it('should use default (false) for disableEOLEvents when neither env nor config is set', () => {
        const config = coreConfig.normalize({});
        expect(config.tracing.disableEOLEvents).to.be.false;
      });

      it('should use config value when env is not set', () => {
        const config = coreConfig.normalize({ userConfig: { tracing: { disableEOLEvents: true } } });
        expect(config.tracing.disableEOLEvents).to.be.true;
      });

      it('should give precedence to INSTANA_TRACING_DISABLE_EOL_EVENTS env var set to true over config set to false', () => {
        process.env.INSTANA_TRACING_DISABLE_EOL_EVENTS = 'true';
        const config = coreConfig.normalize({ userConfig: { tracing: { disableEOLEvents: false } } });
        expect(config.tracing.disableEOLEvents).to.be.true;
      });

      it('should give precedence to INSTANA_TRACING_DISABLE_EOL_EVENTS env var set to false over config set to true', () => {
        process.env.INSTANA_TRACING_DISABLE_EOL_EVENTS = 'false';
        const config = coreConfig.normalize({ userConfig: { tracing: { disableEOLEvents: true } } });
        expect(config.tracing.disableEOLEvents).to.be.false;
      });
    });
  });

  describe('finalConfigBase parameter', () => {
    it('should always preserve finalConfigBase', () => {
      const finalConfigBase = {
        agentHost: '192.168.1.100',
        agentPort: 3000,
        agentRequestTimeout: 10000
      };
      const config = coreConfig.normalize({ finalConfigBase });
      expect(config.agentHost).to.equal('192.168.1.100');
      expect(config.agentPort).to.equal(3000);
      expect(config.agentRequestTimeout).to.equal(10000);
    });

    it('should merge finalConfigBase with userConfig', () => {
      const finalConfigBase = {
        agentHost: '192.168.1.100',
        agentPort: 3000,
        agentRequestTimeout: 5000
      };
      const userConfig = {
        serviceName: 'my-app',
        tracing: {
          enabled: true
        }
      };
      const config = coreConfig.normalize({ userConfig, finalConfigBase });
      expect(config.agentHost).to.equal('192.168.1.100');
      expect(config.agentPort).to.equal(3000);
      expect(config.agentRequestTimeout).to.equal(5000);
      expect(config.serviceName).to.equal('my-app');
      expect(config.tracing.enabled).to.be.true;
    });

    it('should work with empty finalConfigBase', () => {
      const config = coreConfig.normalize({ finalConfigBase: {} });
      expect(config.serviceName).to.be.null;
      expect(config.tracing.enabled).to.be.true;
    });

    it('should work without finalConfigBase parameter', () => {
      const config = coreConfig.normalize({ userConfig: { serviceName: 'test' } });
      expect(config.serviceName).to.equal('test');
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
    expect(config.tracing.stackTrace).to.equal('all');
    expect(config.tracing.stackTraceLength).to.equal(10);
    expect(config.tracing.spanBatchingEnabled).to.be.false;
    expect(config.tracing.disableW3cTraceCorrelation).to.be.false;
    expect(config.tracing.kafka.traceCorrelation).to.be.true;
    expect(config.tracing.useOpentelemetry).to.equal(true);
    expect(config.tracing.allowRootExitSpan).to.equal(false);

    expect(config.preloadOpentelemetry).to.equal(false);

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
