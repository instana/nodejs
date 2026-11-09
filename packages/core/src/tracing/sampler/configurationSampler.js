/*
 * (c) Copyright IBM Corp. 2026
 */

/* global BigInt */

/* eslint-disable no-bitwise */

'use strict';

const tracingUtil = require('../tracingUtil');
const {
  SAMPLING_TYPES,
  SAMPLING_MASK_56,
  MAX_56_BIT_VALUE,
  DEFAULT_SAMPLING_PRECISION
} = require('../../util/constants');

const ZERO_BIGINT = BigInt(0);
const HUNDRED_BIGINT = BigInt(100);

class ConfigurationSampler {
  /**
   * @param {number} [type]
   * @param {number|bigint} [threshold]
   * @param {number} [precision]
   * @param {number} [rate]
   */
  constructor(type = SAMPLING_TYPES.NONE, threshold = 0, precision = 0, rate = undefined) {
    this.updateSamplingParameters(type, threshold, precision, rate);
  }

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

  /**
   * Converts decimal threshold to lowercase hex string for tracestate headers.
   * Trailing zeroes are omitted per OpenTelemetry probabilistic sampling spec.
   *
   * @param {bigint|number|string} threshold
   * @returns {string}
   */
  static thresholdToHex(threshold) {
    let thBigInt = ZERO_BIGINT;
    if (typeof threshold === 'bigint') {
      thBigInt = threshold >= ZERO_BIGINT ? threshold : ZERO_BIGINT;
    } else if (typeof threshold === 'number' && Number.isFinite(threshold) && threshold >= 0) {
      thBigInt = BigInt(Math.floor(threshold));
    } else if (typeof threshold === 'string') {
      try {
        thBigInt = BigInt(threshold.trim());
        if (thBigInt < ZERO_BIGINT) thBigInt = ZERO_BIGINT;
      } catch {
        thBigInt = ZERO_BIGINT;
      }
    }
    if (thBigInt === ZERO_BIGINT) return '0';
    const hex = thBigInt.toString(16).padStart(14, '0');
    return hex.replace(/0+$/, '') || '0';
  }

  /**
   * Converts hex threshold from tracestate (1-14 hex chars, trailing zeros omitted) to decimal threshold.
   *
   * @param {string} hex
   * @returns {number}
   */
  static hexToThreshold(hex) {
    if (!hex || typeof hex !== 'string') return 0;
    const trimmed = hex.trim().toLowerCase();
    if (!/^[0-9a-f]+$/.test(trimmed) || trimmed.length > 14) return 0;
    const padded = trimmed.padEnd(14, '0');
    return Number(BigInt(`0x${padded}`));
  }

  /**
   * A valid rate (1-100) takes precedence over type, threshold and precision.
   *
   * @param {number} [type]
   * @param {number|bigint} [threshold]
   * @param {number} [precision]
   * @param {number} [rate]
   */
  updateSamplingParameters(type = SAMPLING_TYPES.NONE, threshold = 0, precision = 0, rate = undefined) {
    let parsedRate;
    let thresholdBigInt = ZERO_BIGINT;

    if (typeof rate === 'number' && Number.isFinite(rate) && rate >= 1 && rate <= 100) {
      parsedRate = Math.floor(rate);
      thresholdBigInt = ConfigurationSampler.calculateThresholdFromRate(parsedRate);
      type = SAMPLING_TYPES.RANDOM;
      precision = DEFAULT_SAMPLING_PRECISION;
    } else if (typeof threshold === 'bigint') {
      thresholdBigInt = threshold >= ZERO_BIGINT ? threshold : ZERO_BIGINT;
    } else if (Number.isFinite(threshold) && threshold >= 0) {
      thresholdBigInt = BigInt(Math.floor(threshold));
    }

    /** @type {{ type: number, threshold: number, precision: number, rate?: number }} */
    const config = {
      type: Math.floor(type),
      threshold: Number(thresholdBigInt),
      precision: Math.floor(precision)
    };
    if (parsedRate !== undefined) {
      config.rate = parsedRate;
    }
    this.samplingConfig = config;

    this._thresholdBigInt = thresholdBigInt;
  }

  /**
   * @returns {{ type: number, threshold: number, precision: number, rate?: number }}
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
    if (this.samplingConfig.type === SAMPLING_TYPES.RANDOM) {
      if (this._thresholdBigInt === ZERO_BIGINT) {
        return true;
      }

      let idBigInt;
      if (typeof traceId === 'string' && traceId.length > 0) {
        const hex = traceId.length > 16 ? traceId.slice(-16) : traceId;
        try {
          idBigInt = BigInt(`0x${hex}`);
        } catch {
          idBigInt = BigInt(`0x${tracingUtil.generateRandomTraceId()}`);
        }
      } else if (typeof traceId === 'bigint') {
        idBigInt = traceId;
      } else if (typeof traceId === 'number' && Number.isFinite(traceId)) {
        idBigInt = BigInt(Math.floor(traceId));
      } else {
        idBigInt = BigInt(`0x${tracingUtil.generateRandomTraceId()}`);
      }

      const maskedId = idBigInt & SAMPLING_MASK_56;
      if (maskedId < this._thresholdBigInt) {
        return false;
      }
    }

    return true;
  }
}

module.exports = ConfigurationSampler;
