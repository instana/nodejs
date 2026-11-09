/*
 * (c) Copyright IBM Corp. 2026
 */

/* global BigInt */

'use strict';

const { MAX_56_BIT_VALUE } = require('../../util/constants');

const ZERO_BIGINT = BigInt(0);
const HUNDRED_BIGINT = BigInt(100);

class ConfigurationSampler {
  /**
   * Calculates threshold from rate percentage using OpenTelemetry probabilistic sampling formula:
   * th = (2^56 * (100 - rate)) / 100
   *
   * @param {number} rate Sampling rate (1-100)
   * @returns {bigint}
   */
  static calculateThresholdFromRate(rate) {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 1 || rate > 100) {
      return ZERO_BIGINT;
    }
    const rejectionPct = BigInt(100 - Math.floor(rate));
    return (MAX_56_BIT_VALUE * rejectionPct) / HUNDRED_BIGINT;
  }
}

module.exports = ConfigurationSampler;
