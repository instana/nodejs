/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const SamplingType = require('./SamplingType');
const tracingUtil = require('../tracingUtil');

const MASKING_56 = 0xffffffffffffffn;

class ConfigurationSampler {
  /**
   * @param {number} [samplingType=0]
   * @param {number|string|bigint} [threshold=0]
   * @param {number} [precision=0]
   */
  constructor(samplingType = 0, threshold = 0, precision = 0) {
    this.updateSamplingParameters(samplingType, threshold, precision);
  }

  /**
   * @param {number} samplingType
   * @param {number|string|bigint} threshold
   * @param {number} precision
   */
  updateSamplingParameters(samplingType = 0, threshold = 0, precision = 0) {
    let parsedThreshold = 0;
    let thresholdBigInt = 0n;

    if (typeof threshold === 'bigint') {
      thresholdBigInt = threshold >= 0n ? threshold : 0n;
      parsedThreshold = Number(thresholdBigInt);
    } else if (typeof threshold === 'number') {
      parsedThreshold = Number.isFinite(threshold) && threshold >= 0 ? Math.floor(threshold) : 0;
      thresholdBigInt = BigInt(parsedThreshold);
    } else if (typeof threshold === 'string') {
      const trimmed = threshold.trim();
      try {
        if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
          thresholdBigInt = BigInt(trimmed);
        } else {
          thresholdBigInt = BigInt(trimmed);
        }
        if (thresholdBigInt < 0n) thresholdBigInt = 0n;
        parsedThreshold = Number(thresholdBigInt);
      } catch {
        parsedThreshold = 0;
        thresholdBigInt = 0n;
      }
    }

    const parsedType =
      typeof samplingType === 'number'
        ? Math.floor(samplingType)
        : Number.isFinite(Number(samplingType))
          ? Math.floor(Number(samplingType))
          : 0;
    const parsedPrecision =
      typeof precision === 'number'
        ? Math.floor(precision)
        : Number.isFinite(Number(precision))
          ? Math.floor(Number(precision))
          : 0;

    this.samplingConfig = {
      type: parsedType,
      threshold: parsedThreshold,
      precision: parsedPrecision
    };

    this._thresholdBigInt = thresholdBigInt;
  }

  /**
   * @returns {{ type: number, threshold: number, precision: number }}
   */
  getSamplingConfig() {
    return this.samplingConfig;
  }

  /**
   * Evaluates if a trace should be sampled based on its trace ID.
   *
   * @param {string|bigint|number} [traceId]
   * @returns {boolean} True if sampled/kept, false if rejected/dropped.
   */
  shouldSample(traceId) {
    if (this.samplingConfig.type === SamplingType.RANDOM) {
      if (this._thresholdBigInt === 0n) {
        return true;
      }

      let idBigInt;
      if (typeof traceId === 'string' && traceId.length > 0) {
        const hex = traceId.length > 16 ? traceId.slice(-16) : traceId;
        try {
          idBigInt = BigInt('0x' + hex);
        } catch {
          idBigInt = BigInt('0x' + tracingUtil.generateRandomTraceId());
        }
      } else if (typeof traceId === 'bigint') {
        idBigInt = traceId;
      } else if (typeof traceId === 'number' && Number.isFinite(traceId)) {
        idBigInt = BigInt(Math.floor(traceId));
      } else {
        idBigInt = BigInt('0x' + tracingUtil.generateRandomTraceId());
      }

      const maskedId = idBigInt & MASKING_56;
      if (maskedId < this._thresholdBigInt) {
        return false;
      }
    }

    return true;
  }
}

module.exports = ConfigurationSampler;
