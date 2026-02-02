/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');

describe('OpenTelemetry instrumentations registry', () => {
  let instrumentationsModule;

  beforeEach(() => {
    delete require.cache[require.resolve('../../../src/tracing/opentelemetry-instrumentations/instrumentations')];
    instrumentationsModule = require('../../../src/tracing/opentelemetry-instrumentations/instrumentations');
  });

  describe('getInstrumentations', () => {
    it('should return an object', () => {
      const instrumentations = instrumentationsModule.getInstrumentations();
      expect(instrumentations).to.be.an('object');
    });

    it('should return the same object on multiple calls', () => {
      const first = instrumentationsModule.getInstrumentations();
      const second = instrumentationsModule.getInstrumentations();
      expect(first).to.equal(second);
    });

    it('should contain fs instrumentation', () => {
      const instrumentations = instrumentationsModule.getInstrumentations();
      expect(instrumentations).to.have.property('@opentelemetry/instrumentation-fs');
      expect(instrumentations['@opentelemetry/instrumentation-fs']).to.deep.equal({ name: 'fs' });
    });

    it('should contain restify instrumentation', () => {
      const instrumentations = instrumentationsModule.getInstrumentations();
      expect(instrumentations).to.have.property('@opentelemetry/instrumentation-restify');
      expect(instrumentations['@opentelemetry/instrumentation-restify']).to.deep.equal({ name: 'restify' });
    });

    it('should have exactly 6 instrumentations', () => {
      const instrumentations = instrumentationsModule.getInstrumentations();
      expect(Object.keys(instrumentations)).to.have.lengthOf(6);
    });
  });

  describe('preload', () => {
    let consoleLogStub;

    beforeEach(() => {
      consoleLogStub = sinon.stub(console, 'log');
    });

    afterEach(() => {
      consoleLogStub.restore();
    });

    it('should be a function', () => {
      expect(instrumentationsModule.preload).to.be.a('function');
    });

    it('should not throw when called', () => {
      expect(() => {
        instrumentationsModule.preload();
      }).to.not.throw();
    });

    it('should complete in reasonable time', () => {
      const startTime = Date.now();
      instrumentationsModule.preload();
      const duration = Date.now() - startTime;

      expect(duration).to.be.lessThan(1000);
    });
  });
});
