/*
 * (c) Copyright IBM Corp. 2026
 */

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
});
