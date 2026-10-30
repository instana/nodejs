/*
 * (c) Copyright IBM Corp. 2026
 */

/* global BigInt */

/* eslint-disable no-bitwise */

'use strict';

const SamplingType = require('./SamplingType');
const tracingUtil = require('../tracingUtil');

const MASKING_56 = BigInt('0xffffffffffffff');
const MAX_56_BIT_VALUE = BigInt('72057594037927936'); // 2^56
const ZERO_BIGINT = BigInt(0);
const HUNDRED_BIGINT = BigInt(100);

class ConfigurationSampler {
  /**
   * @param {number|Object} [samplingType=0]
   * @param {number|string|bigint} [threshold=0]
   * @param {number} [precision=0]
   * @param {number} [rate]
   */
  constructor(samplingType = 0, threshold = 0, precision = 0, rate = undefined) {
    this.updateSamplingParameters(samplingType, threshold, precision, rate);
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
   * @param {number|Object} samplingType
   * @param {number|string|bigint} [threshold=0]
   * @param {number} [precision=0]
   * @param {number} [rate]
   */
  updateSamplingParameters(samplingType = 0, threshold = 0, precision = 0, rate = undefined) {
    if (typeof samplingType === 'object' && samplingType !== null) {
      const opts = /** @type {any} */ (samplingType);
      rate = opts.rate;
      if (opts.precision !== undefined) {
        precision = opts.precision;
      } else if (opts.rate !== undefined) {
        precision = 4;
      } else {
        precision = 0;
      }
      threshold = opts.threshold !== undefined ? opts.threshold : 0;
      if (opts.type !== undefined) {
        samplingType = opts.type;
      } else if (opts.rate !== undefined) {
        samplingType = 1;
      } else {
        samplingType = 0;
      }
    }

    let parsedRate;
    let parsedThreshold = 0;
    let thresholdBigInt = ZERO_BIGINT;
    let parsedType = 0;
    let parsedPrecision = 0;

    if (rate !== undefined && rate !== null) {
      const numRate = typeof rate === 'number' ? rate : Number(rate);
      if (Number.isFinite(numRate) && numRate >= 1 && numRate <= 100) {
        parsedRate = Math.floor(numRate);
        thresholdBigInt = ConfigurationSampler.calculateThresholdFromRate(parsedRate);
        parsedThreshold = Number(thresholdBigInt);
        parsedType = SamplingType.RANDOM;
        parsedPrecision = 4;
      }
    }

    if (parsedRate === undefined) {
      if (typeof threshold === 'bigint') {
        thresholdBigInt = threshold >= ZERO_BIGINT ? threshold : ZERO_BIGINT;
        parsedThreshold = Number(thresholdBigInt);
      } else if (typeof threshold === 'number') {
        parsedThreshold = Number.isFinite(threshold) && threshold >= 0 ? Math.floor(threshold) : 0;
        thresholdBigInt = BigInt(parsedThreshold);
      } else if (typeof threshold === 'string') {
        const trimmed = threshold.trim();
        try {
          thresholdBigInt = BigInt(trimmed);
          if (thresholdBigInt < ZERO_BIGINT) thresholdBigInt = ZERO_BIGINT;
          parsedThreshold = Number(thresholdBigInt);
        } catch {
          parsedThreshold = 0;
          thresholdBigInt = ZERO_BIGINT;
        }
      }

      if (typeof samplingType === 'number') {
        parsedType = Math.floor(samplingType);
      } else if (Number.isFinite(Number(samplingType))) {
        parsedType = Math.floor(Number(samplingType));
      } else {
        parsedType = 0;
      }

      if (typeof precision === 'number') {
        parsedPrecision = Math.floor(precision);
      } else if (Number.isFinite(Number(precision))) {
        parsedPrecision = Math.floor(Number(precision));
      } else {
        parsedPrecision = 0;
      }
    }

    /** @type {{ type: number, threshold: number, precision: number, rate?: number }} */
    const config = {
      type: parsedType,
      threshold: parsedThreshold,
      precision: parsedPrecision
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
    if (this.samplingConfig.type === SamplingType.RANDOM) {
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

      const maskedId = idBigInt & MASKING_56;
      if (maskedId < this._thresholdBigInt) {
        return false;
      }
    }

    return true;
  }
}

module.exports = ConfigurationSampler;
