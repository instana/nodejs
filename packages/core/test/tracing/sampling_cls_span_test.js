/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const proxyquire = require('proxyquire');
const { expect } = require('chai');
const testUtils = require('../test_util');
const constants = require('../../src/tracing/constants');
const backendMapper = require('../../src/tracing/backend_mappers/mapper');
const { ConfigurationSampler } = require('../../src/tracing/sampler');

describe('tracing/sampling - CLS and Span integration', () => {
  let cls;

  beforeEach(() => {
    cls = proxyquire('../../src/tracing/cls', {});
    cls.init({ logger: testUtils.createFakeLogger() });
  });

  it('should initialize and activate sampler from config', () => {
    const config = {
      logger: testUtils.createFakeLogger(),
      tracing: {
        sampling: {
          enable: true,
          type: 1,
          threshold: 50,
          precision: 4
        }
      }
    };

    cls.init(config);
    expect(cls.getSampler()).to.be.an.instanceOf(ConfigurationSampler);
    expect(cls.getSampler().getSamplingConfig()).to.deep.equal({
      type: 1,
      threshold: 50,
      precision: 4
    });

    // Update config dynamically via activate
    cls.activate({
      tracing: {
        sampling: {
          enable: true,
          type: 1,
          threshold: 100,
          precision: 8
        }
      }
    });

    expect(cls.getSampler().getSamplingConfig()).to.deep.equal({
      type: 1,
      threshold: 100,
      precision: 8
    });
  });

  it('should set sampling parameters and sm object on new root entry span when sampled', () => {
    cls.setSampler(new ConfigurationSampler(1, 50, 4));

    cls.ns.runAndReturn(() => {
      // Create a root entry span with a trace ID whose lower 56 bits (0xc8 = 200) >= threshold (50)
      const span = cls.startSpan({
        spanName: 'test-entry',
        kind: constants.ENTRY,
        spanData: {}
      });

      // Force a known sampled traceId
      span.t = '00000000000000c8';
      span.setSamplingParameters(1, 50, 4);

      expect(span.samplingType).to.equal(1);
      expect(span.samplingThreshold).to.equal(50);
      expect(span.samplingPrecision).to.equal(4);
      expect(span.sm).to.deep.equal({
        s: 1,
        th: 50,
        p: 4
      });

      // When serialized to JSON, "sm" must be included
      const json = JSON.parse(JSON.stringify(span));
      expect(json.sm).to.deep.equal({
        s: 1,
        th: 50,
        p: 4
      });
    });
  });

  it('should inherit sampling parameters from entry span to intermediate and exit spans', () => {
    cls.ns.runAndReturn(() => {
      const entrySpan = cls.startSpan({
        spanName: 'test-entry',
        kind: constants.ENTRY,
        spanData: {}
      });
      entrySpan.setSamplingParameters(1, 234567892345, 4);

      // Intermediate span under entry span
      const intermediateSpan = cls.startSpan({
        spanName: 'test-intermediate',
        kind: constants.INTERMEDIATE,
        spanData: {}
      });

      expect(intermediateSpan.samplingType).to.equal(entrySpan.samplingType);
      expect(intermediateSpan.samplingThreshold).to.equal(entrySpan.samplingThreshold);
      expect(intermediateSpan.samplingPrecision).to.equal(entrySpan.samplingPrecision);
      expect(intermediateSpan.sm).to.deep.equal(entrySpan.sm);

      // Exit span under intermediate span
      const exitSpan = cls.startSpan({
        spanName: 'test-exit',
        kind: constants.EXIT,
        spanData: {}
      });

      expect(exitSpan.samplingType).to.equal(entrySpan.samplingType);
      expect(exitSpan.samplingThreshold).to.equal(entrySpan.samplingThreshold);
      expect(exitSpan.samplingPrecision).to.equal(entrySpan.samplingPrecision);
      expect(exitSpan.sm).to.deep.equal(entrySpan.sm);
    });
  });

  it('should omit sm object when samplingThreshold is 0 or unset', () => {
    cls.ns.runAndReturn(() => {
      const span = cls.startSpan({
        spanName: 'test-entry',
        kind: constants.ENTRY,
        spanData: {}
      });
      span.setSamplingParameters(0, 0, 0);

      expect(span.sm).to.be.undefined;

      const json = JSON.parse(JSON.stringify(span));
      expect(json.sm).to.be.undefined;
    });
  });

  it('should clear sampling parameters when clearSamplingParameters is called', () => {
    cls.ns.runAndReturn(() => {
      const span = cls.startSpan({
        spanName: 'test-entry',
        kind: constants.ENTRY,
        spanData: {}
      });
      span.setSamplingParameters(1, 100, 4);
      expect(span.sm).to.exist;

      span.clearSamplingParameters();
      expect(span.samplingType).to.equal(0);
      expect(span.samplingThreshold).to.equal(0);
      expect(span.samplingPrecision).to.equal(0);
      expect(span.sm).to.be.undefined;
    });
  });

  it('should reject span and suppress downstream tracing when sampler rejects trace', () => {
    // Max threshold rejects all traces
    cls.setSampler(new ConfigurationSampler(1, 0xffffffffffffffn, 0));

    cls.ns.runAndReturn(() => {
      const span = cls.startSpan({
        spanName: 'test-entry',
        kind: constants.ENTRY,
        spanData: {}
      });

      expect(span.isIgnored).to.be.true;
      expect(cls.tracingSuppressed()).to.be.true;
    });
  });

  describe('backendMapper.transform', () => {
    it('should add sm payload when span has samplingThreshold > 0', () => {
      const span = {
        n: 'node.http.server',
        data: { http: { method: 'GET' } },
        samplingType: 1,
        samplingThreshold: 234567892345,
        samplingPrecision: 4
      };

      const transformed = backendMapper.transform(span);
      expect(transformed.sm).to.deep.equal({
        s: 1,
        th: 234567892345,
        p: 4
      });
    });

    it('should not add sm payload when samplingThreshold is 0 or unset', () => {
      const span = {
        n: 'node.http.server',
        data: { http: { method: 'GET' } },
        samplingType: 0,
        samplingThreshold: 0,
        samplingPrecision: 0
      };

      const transformed = backendMapper.transform(span);
      expect(transformed.sm).to.be.undefined;
    });
  });
});
