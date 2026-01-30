/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const proxyquire = require('proxyquire');
const sinon = require('sinon');

describe('OpenTelemetry instrumentations preloading', () => {
  let preloadModule;
  let consoleLogStub;

  beforeEach(() => {
    consoleLogStub = sinon.stub(console, 'log');
    preloadModule = proxyquire('../../../src/tracing/opentelemetry-instrumentations/instrumentations', {});
  });

  afterEach(() => {
    consoleLogStub.restore();
  });

  describe('getInstrumentations', () => {
    it('should return the instrumentations registry object', () => {
      const instrumentations = preloadModule.getInstrumentations();

      expect(instrumentations).to.be.an('object');
      expect(instrumentations).to.have.property('@opentelemetry/instrumentation-fs');
      expect(instrumentations['@opentelemetry/instrumentation-fs']).to.deep.equal({ name: 'fs' });
    });

    it('should include all expected instrumentations', () => {
      const instrumentations = preloadModule.getInstrumentations();
      const expectedPackages = [
        '@opentelemetry/instrumentation-fs',
        '@opentelemetry/instrumentation-restify',
        '@opentelemetry/instrumentation-socket.io',
        '@opentelemetry/instrumentation-tedious',
        '@opentelemetry/instrumentation-oracledb',
        '@instana/instrumentation-confluent-kafka-javascript'
      ];

      expectedPackages.forEach(pkg => {
        expect(instrumentations).to.have.property(pkg);
      });
    });
  });

  describe('getInstrumentationPackageNames', () => {
    it('should return an array of package names', () => {
      const packageNames = preloadModule.getInstrumentationPackageNames();

      expect(packageNames).to.be.an('array');
      expect(packageNames.length).to.be.greaterThan(0);
    });

    it('should include all expected package names', () => {
      const packageNames = preloadModule.getInstrumentationPackageNames();

      expect(packageNames).to.include('@opentelemetry/instrumentation-fs');
      expect(packageNames).to.include('@opentelemetry/instrumentation-restify');
      expect(packageNames).to.include('@opentelemetry/instrumentation-socket.io');
      expect(packageNames).to.include('@opentelemetry/instrumentation-tedious');
      expect(packageNames).to.include('@opentelemetry/instrumentation-oracledb');
      expect(packageNames).to.include('@instana/instrumentation-confluent-kafka-javascript');
    });

    it('should return the same count as the instrumentations object', () => {
      const instrumentations = preloadModule.getInstrumentations();
      const packageNames = preloadModule.getInstrumentationPackageNames();

      expect(packageNames.length).to.equal(Object.keys(instrumentations).length);
    });
  });

  describe('preloadOtelInstrumentations', () => {
    it('should be a function', () => {
      expect(preloadModule.preloadOtelInstrumentations).to.be.a('function');
    });

    it('should not throw when called', () => {
      expect(() => {
        preloadModule.preloadOtelInstrumentations();
      }).to.not.throw();
    });

    it('should log preloading start message', () => {
      preloadModule.preloadOtelInstrumentations();

      const startMessage = consoleLogStub.args.find(
        args => args[0].includes('Preloading') && args[0].includes('OpenTelemetry instrumentations')
      );
      expect(startMessage).to.exist;
    });

    it('should use package names from instrumentations registry', () => {
      const packageNames = preloadModule.getInstrumentationPackageNames();

      expect(packageNames).to.be.an('array');
      expect(packageNames).to.include('@opentelemetry/instrumentation-fs');
      expect(packageNames).to.include('@opentelemetry/instrumentation-restify');
      expect(packageNames.length).to.be.greaterThan(0);
    });
  });
});

describe('Config integration', () => {
  let configModule;

  beforeEach(() => {
    delete require.cache[require.resolve('../../../src/config')];
    configModule = require('../../../src/config');
  });

  it('should have isAwsLambda in default config', () => {
    const config = configModule.normalize({});

    expect(config.tracing).to.have.property('isAwsLambda');
    expect(config.tracing.isAwsLambda).to.be.false;
  });

  it('should allow setting isAwsLambda to true', () => {
    const config = configModule.normalize({
      tracing: {
        isAwsLambda: true
      }
    });

    expect(config.tracing.isAwsLambda).to.be.true;
  });

  it('should preserve other tracing config when setting isAwsLambda', () => {
    const config = configModule.normalize({
      tracing: {
        enabled: true,
        isAwsLambda: true,
        useOpentelemetry: true
      }
    });

    expect(config.tracing.enabled).to.be.true;
    expect(config.tracing.isAwsLambda).to.be.true;
    expect(config.tracing.useOpentelemetry).to.be.true;
  });
});
