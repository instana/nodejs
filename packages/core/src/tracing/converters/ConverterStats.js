/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * Statistics tracking for span converters
 *
 * Tracks conversion performance metrics including:
 * - Total conversions
 * - Success/failure rates
 * - Conversion timing
 * - Dropped fields
 * - Memory usage
 *
 * @module tracing/converters/ConverterStats
 */

/**
 * Statistics tracker for span conversion operations
 *
 * @class ConverterStats
 */
class ConverterStats {
  /**
   * Create a new statistics tracker
   *
   * @param {string} converterName - Name of the converter being tracked
   */
  constructor(converterName) {
    this.converterName = converterName;
    this.reset();
  }

  /**
   * Reset all statistics to initial values
   */
  reset() {
    this.totalConversions = 0;
    this.successfulConversions = 0;
    this.failedConversions = 0;
    this.droppedFields = 0;
    this.totalConversionTimeMs = 0;
    this.minConversionTimeMs = Infinity;
    this.maxConversionTimeMs = 0;
    this.lastResetTime = Date.now();
    this.errorsByType = {};
  }

  /**
   * Record a successful conversion
   *
   * @param {number} durationMs - Time taken for conversion in milliseconds
   * @param {number} [droppedFieldCount=0] - Number of fields dropped during conversion
   */
  recordSuccess(durationMs, droppedFieldCount = 0) {
    this.totalConversions++;
    this.successfulConversions++;
    this.droppedFields += droppedFieldCount;
    this._updateTiming(durationMs);
  }

  /**
   * Record a failed conversion
   *
   * @param {number} durationMs - Time taken before failure in milliseconds
   * @param {string} errorType - Type of error that occurred
   */
  recordFailure(durationMs, errorType) {
    this.totalConversions++;
    this.failedConversions++;
    this._updateTiming(durationMs);

    // Track error types
    if (!this.errorsByType[errorType]) {
      this.errorsByType[errorType] = 0;
    }
    this.errorsByType[errorType]++;
  }

  /**
   * Update timing statistics
   *
   * @private
   * @param {number} durationMs - Duration in milliseconds
   */
  _updateTiming(durationMs) {
    this.totalConversionTimeMs += durationMs;
    this.minConversionTimeMs = Math.min(this.minConversionTimeMs, durationMs);
    this.maxConversionTimeMs = Math.max(this.maxConversionTimeMs, durationMs);
  }

  /**
   * Get average conversion time
   *
   * @returns {number} Average conversion time in milliseconds
   */
  getAverageConversionTimeMs() {
    if (this.totalConversions === 0) {
      return 0;
    }
    return this.totalConversionTimeMs / this.totalConversions;
  }

  /**
   * Get success rate as a percentage
   *
   * @returns {number} Success rate (0-100)
   */
  getSuccessRate() {
    if (this.totalConversions === 0) {
      return 100;
    }
    return (this.successfulConversions / this.totalConversions) * 100;
  }

  /**
   * Get failure rate as a percentage
   *
   * @returns {number} Failure rate (0-100)
   */
  getFailureRate() {
    return 100 - this.getSuccessRate();
  }

  /**
   * Get average dropped fields per conversion
   *
   * @returns {number} Average dropped fields
   */
  getAverageDroppedFields() {
    if (this.totalConversions === 0) {
      return 0;
    }
    return this.droppedFields / this.totalConversions;
  }

  /**
   * Get uptime since last reset
   *
   * @returns {number} Uptime in milliseconds
   */
  getUptimeMs() {
    return Date.now() - this.lastResetTime;
  }

  /**
   * Get conversions per second
   *
   * @returns {number} Conversions per second
   */
  getConversionsPerSecond() {
    const uptimeSeconds = this.getUptimeMs() / 1000;
    if (uptimeSeconds === 0) {
      return 0;
    }
    return this.totalConversions / uptimeSeconds;
  }

  /**
   * Get most common error type
   *
   * @returns {string|null} Most common error type or null if no errors
   */
  getMostCommonErrorType() {
    const errorTypes = Object.keys(this.errorsByType);
    if (errorTypes.length === 0) {
      return null;
    }

    return errorTypes.reduce((mostCommon, errorType) => {
      if (!mostCommon || this.errorsByType[errorType] > this.errorsByType[mostCommon]) {
        return errorType;
      }
      return mostCommon;
    }, null);
  }

  /**
   * Get a summary of all statistics
   *
   * @returns {Object} Statistics summary
   */
  getSummary() {
    return {
      converterName: this.converterName,
      totalConversions: this.totalConversions,
      successfulConversions: this.successfulConversions,
      failedConversions: this.failedConversions,
      successRate: `${this.getSuccessRate().toFixed(2)}%`,
      failureRate: `${this.getFailureRate().toFixed(2)}%`,
      droppedFields: this.droppedFields,
      averageDroppedFields: this.getAverageDroppedFields().toFixed(2),
      timing: {
        totalMs: this.totalConversionTimeMs.toFixed(2),
        averageMs: this.getAverageConversionTimeMs().toFixed(2),
        minMs: this.minConversionTimeMs === Infinity ? 0 : this.minConversionTimeMs.toFixed(2),
        maxMs: this.maxConversionTimeMs.toFixed(2)
      },
      performance: {
        conversionsPerSecond: this.getConversionsPerSecond().toFixed(2),
        uptimeMs: this.getUptimeMs()
      },
      errors: {
        byType: this.errorsByType,
        mostCommon: this.getMostCommonErrorType()
      }
    };
  }

  /**
   * Convert statistics to JSON
   *
   * @returns {Object} JSON representation
   */
  toJSON() {
    return this.getSummary();
  }

  /**
   * Get a human-readable string representation
   *
   * @returns {string} Formatted statistics
   */
  toString() {
    const summary = this.getSummary();
    return (
      `ConverterStats[${this.converterName}]: ` +
      `${summary.totalConversions} conversions, ` +
      `${summary.successRate} success rate, ` +
      `${summary.timing.averageMs}ms avg, ` +
      `${summary.performance.conversionsPerSecond} conv/s`
    );
  }
}

module.exports = ConverterStats;

// Made with Bob
