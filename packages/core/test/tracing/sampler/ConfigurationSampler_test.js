/*
 * (c) Copyright IBM Corp. 2026
 */

/* eslint-disable no-loss-of-precision */

'use strict';

const { expect } = require('chai');
const ConfigurationSampler = require('../../../src/tracing/sampler/ConfigurationSampler');
const SamplingType = require('../../../src/tracing/sampler/SamplingType');

describe('ConfigurationSampler', () => {
  it('should initialize with valid parameters', () => {
    const sampler = new ConfigurationSampler(1, 50, 4);
    const config = sampler.getSamplingConfig();
    expect(config.type).to.equal(1);
    expect(config.threshold).to.equal(50);
    expect(config.precision).to.equal(4);
  });

  it('should initialize with default parameters (0, 0, 0)', () => {
    const sampler = new ConfigurationSampler();
    const config = sampler.getSamplingConfig();
    expect(config.type).to.equal(0);
    expect(config.threshold).to.equal(0);
    expect(config.precision).to.equal(0);
  });

  it('should always sample with type 0 (NONE)', () => {
    const sampler = new ConfigurationSampler(SamplingType.NONE, 50, 4);
    const iterations = 1000;
    let sampledCount = 0;
    for (let i = 0; i < iterations; i++) {
      if (sampler.shouldSample()) {
        sampledCount++;
      }
    }
    expect(sampledCount).to.equal(iterations);
  });

  it('should sample all traces with type 1 (RANDOM) and threshold 0', () => {
    const sampler = new ConfigurationSampler(SamplingType.RANDOM, 0, 0);
    const iterations = 1000;
    let sampledCount = 0;
    for (let i = 0; i < iterations; i++) {
      if (sampler.shouldSample()) {
        sampledCount++;
      }
    }
    expect(sampledCount).to.equal(iterations);
  });

  it('should reject all traces with max 56-bit threshold 0xFFFFFFFFFFFFFF', () => {
    const maxThreshold = 0xffffffffffffffn;
    const sampler = new ConfigurationSampler(SamplingType.RANDOM, maxThreshold, 0);
    const iterations = 1000;
    let sampledCount = 0;
    for (let i = 0; i < iterations; i++) {
      if (sampler.shouldSample()) {
        sampledCount++;
      }
    }
    expect(sampledCount).to.equal(0);
  });

  it('should correctly sample/reject specific trace IDs with known 56-bit masks', () => {
    // Threshold = 100
    const sampler = new ConfigurationSampler(SamplingType.RANDOM, 100, 4);

    // Trace ID whose lower 56 bits are 50 (below threshold 100) -> should be rejected
    const belowThresholdTraceId = '0000000000000032'; // 0x32 = 50
    expect(sampler.shouldSample(belowThresholdTraceId)).to.be.false;

    // Trace ID whose lower 56 bits are 200 (above threshold 100) -> should be sampled
    const aboveThresholdTraceId = '00000000000000c8'; // 0xc8 = 200
    expect(sampler.shouldSample(aboveThresholdTraceId)).to.be.true;

    // Trace ID with high bits set (to test 56-bit masking):
    // 0xFF00000000000032 -> masked to 56 bits = 0x00000000000032 = 50 < 100 -> rejected
    const highBitBelowTraceId = 'ff00000000000032';
    expect(sampler.shouldSample(highBitBelowTraceId)).to.be.false;

    // 0xFF000000000000c8 -> masked to 56 bits = 0x000000000000c8 = 200 >= 100 -> sampled
    const highBitAboveTraceId = 'ff000000000000c8';
    expect(sampler.shouldSample(highBitAboveTraceId)).to.be.true;
  });

  it('should support dynamic configuration updates via updateSamplingParameters', () => {
    const sampler = new ConfigurationSampler(SamplingType.NONE, 0, 0);
    expect(sampler.shouldSample('0000000000000032')).to.be.true;

    sampler.updateSamplingParameters(SamplingType.RANDOM, 100, 4);
    const config = sampler.getSamplingConfig();
    expect(config.type).to.equal(1);
    expect(config.threshold).to.equal(100);
    expect(config.precision).to.equal(4);

    expect(sampler.shouldSample('0000000000000032')).to.be.false;
    expect(sampler.shouldSample('00000000000000c8')).to.be.true;
  });

  it('should handle string thresholds and BigInt thresholds', () => {
    const sampler = new ConfigurationSampler(SamplingType.RANDOM, '234567892345', '4');
    const config = sampler.getSamplingConfig();
    expect(config.type).to.equal(1);
    expect(config.threshold).to.equal(234567892345);
    expect(config.precision).to.equal(4);
  });

  describe('calculateThresholdFromRate', () => {
    it('should correctly calculate threshold for rate=100 (0% rejection)', () => {
      const th = ConfigurationSampler.calculateThresholdFromRate(100);
      expect(th).to.equal(0n);
    });

    it('should correctly calculate threshold for rate=50 (50% rejection)', () => {
      const th = ConfigurationSampler.calculateThresholdFromRate(50);
      expect(th).to.equal(36028797018963968n);
    });

    it('should correctly calculate threshold for rate=25 (75% rejection)', () => {
      const th = ConfigurationSampler.calculateThresholdFromRate(25);
      expect(th).to.equal(54043195528445952n);
    });

    it('should correctly calculate threshold for rate=10 (90% rejection)', () => {
      const th = ConfigurationSampler.calculateThresholdFromRate(10);
      expect(th).to.equal(64851834634135142n);
    });

    it('should correctly calculate threshold for rate=1 (99% rejection)', () => {
      const th = ConfigurationSampler.calculateThresholdFromRate(1);
      expect(th).to.equal(71337018097548656n);
    });

    it('should correctly calculate threshold for rate=99 (1% rejection)', () => {
      const th = ConfigurationSampler.calculateThresholdFromRate(99);
      expect(th).to.equal(720575940379279n);
    });

    it('should return 0n for invalid rates', () => {
      expect(ConfigurationSampler.calculateThresholdFromRate(0)).to.equal(0n);
      expect(ConfigurationSampler.calculateThresholdFromRate(101)).to.equal(0n);
      expect(ConfigurationSampler.calculateThresholdFromRate(-5)).to.equal(0n);
      expect(ConfigurationSampler.calculateThresholdFromRate(NaN)).to.equal(0n);
    });
  });

  describe('thresholdToHex and hexToThreshold', () => {
    it('should convert thresholds to hex with trailing zeros omitted', () => {
      expect(ConfigurationSampler.thresholdToHex(0)).to.equal('0');
      expect(ConfigurationSampler.thresholdToHex(36028797018963968n)).to.equal('8');
      expect(ConfigurationSampler.thresholdToHex(54043195528445952n)).to.equal('c');
      expect(ConfigurationSampler.thresholdToHex(64851834634135142n)).to.equal('e6666666666666');
      expect(ConfigurationSampler.thresholdToHex(71337018097548656n)).to.equal('fd70a3d70a3d7');
      expect(ConfigurationSampler.thresholdToHex(720575940379279n)).to.equal('028f5c28f5c28f');
    });

    it('should convert hex strings from tracestate to decimal threshold', () => {
      expect(ConfigurationSampler.hexToThreshold('0')).to.equal(0);
      expect(ConfigurationSampler.hexToThreshold('8')).to.equal(36028797018963968);
      expect(ConfigurationSampler.hexToThreshold('c')).to.equal(54043195528445952);
      expect(ConfigurationSampler.hexToThreshold('e6666666666666')).to.equal(64851834634135142);
      expect(ConfigurationSampler.hexToThreshold('fd70a3d70a3d7')).to.equal(71337018097548656);
      expect(ConfigurationSampler.hexToThreshold('028f5c28f5c28f')).to.equal(720575940379279);
    });
  });

  describe('rate-based configuration and precedence', () => {
    it('should initialize with rate parameter', () => {
      const sampler = new ConfigurationSampler(1, 0, 4, 50);
      const config = sampler.getSamplingConfig();
      expect(config.rate).to.equal(50);
      expect(config.type).to.equal(1);
      expect(config.threshold).to.equal(36028797018963968);
      expect(config.precision).to.equal(4);
    });

    it('should initialize with options object and give precedence to rate', () => {
      const sampler = new ConfigurationSampler({
        rate: 25,
        threshold: 12345,
        type: 1,
        precision: 14
      });
      const config = sampler.getSamplingConfig();
      expect(config.rate).to.equal(25);
      expect(config.type).to.equal(1);
      expect(config.threshold).to.equal(54043195528445952);
      expect(config.precision).to.equal(4);
    });
  });
});
