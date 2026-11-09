/*
 * (c) Copyright IBM Corp. 2026
 */

/* eslint-disable no-loss-of-precision */

'use strict';

const { expect } = require('chai');
const ConfigurationSampler = require('../../../src/tracing/sampler/configurationSampler');

describe('ConfigurationSampler', () => {
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
});
