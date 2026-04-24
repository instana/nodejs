/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * Base class for span format converters
 *
 * Provides the foundation for converting Instana spans to other formats.
 * Implementations must be stateless and thread-safe.
 *
 * @module tracing/converters/SpanConverter
 */

const { SpanFormat } = require('./types');

/**
 * Abstract base class for span converters
 *
 * @abstract
 * @class SpanConverter
 */
class SpanConverter {
  /**
   * Create a new span converter
   *
   * @param {Object} config - Converter configuration
   * @param {string} config.targetFormat - Target span format
   * @param {boolean} [config.validateAfterConversion=true] - Whether to validate after conversion
   * @param {boolean} [config.preserveInstanaFields=true] - Whether to preserve Instana-specific fields
   * @param {boolean} [config.enablePerformanceTracking=true] - Whether to track performance metrics
   */
  constructor(config = {}) {
    if (new.target === SpanConverter) {
      throw new TypeError('Cannot construct SpanConverter instances directly - use a concrete implementation');
    }

    this.config = {
      targetFormat: config.targetFormat || SpanFormat.INSTANA,
      validateAfterConversion: config.validateAfterConversion !== false,
      preserveInstanaFields: config.preserveInstanaFields !== false,
      enablePerformanceTracking: config.enablePerformanceTracking !== false,
      ...config
    };

    // Initialize statistics
    this.stats = {
      conversionsTotal: 0,
      conversionsSuccess: 0,
      conversionsFailed: 0,
      avgConversionTimeUs: 0,
      peakConversionTimeUs: 0,
      totalFieldsDropped: 0,
      _conversionTimes: [] // Internal array for calculating average
    };
  }

  /**
   * Get the target format this converter produces
   *
   * @abstract
   * @returns {string} The target format
   */
  getTargetFormat() {
    throw new Error('getTargetFormat() must be implemented by subclass');
  }

  /**
   * Get the format version this converter implements
   *
   * @abstract
   * @returns {string} The format version
   */
  getFormatVersion() {
    throw new Error('getFormatVersion() must be implemented by subclass');
  }

  /**
   * Convert an Instana span to the target format
   *
   * @abstract
   * @param {Object} span - The Instana span to convert
   * @returns {Object} Conversion result with the converted span and metadata
   * @throws {ConversionError} if conversion fails
   */
  convert(span) {
    throw new Error('convert() must be implemented by subclass');
  }

  /**
   * Validate a span in the target format
   *
   * @abstract
   * @param {*} span - The span to validate
   * @returns {Object} Validation result
   */
  validate(span) {
    throw new Error('validate() must be implemented by subclass');
  }

  /**
   * Get converter statistics
   *
   * @returns {Object} Current statistics
   */
  getStats() {
    return {
      conversionsTotal: this.stats.conversionsTotal,
      conversionsSuccess: this.stats.conversionsSuccess,
      conversionsFailed: this.stats.conversionsFailed,
      avgConversionTimeUs: this.stats.avgConversionTimeUs,
      peakConversionTimeUs: this.stats.peakConversionTimeUs,
      totalFieldsDropped: this.stats.totalFieldsDropped
    };
  }

  /**
   * Reset converter statistics
   */
  resetStats() {
    this.stats = {
      conversionsTotal: 0,
      conversionsSuccess: 0,
      conversionsFailed: 0,
      avgConversionTimeUs: 0,
      peakConversionTimeUs: 0,
      totalFieldsDropped: 0,
      _conversionTimes: []
    };
  }

  /**
   * Update statistics after a conversion attempt
   *
   * @protected
   * @param {boolean} success - Whether the conversion succeeded
   * @param {number} conversionTimeUs - Time taken for conversion (microseconds)
   * @param {number} fieldsDropped - Number of fields dropped
   */
  _updateStats(success, conversionTimeUs, fieldsDropped = 0) {
    this.stats.conversionsTotal++;

    if (success) {
      this.stats.conversionsSuccess++;
    } else {
      this.stats.conversionsFailed++;
    }

    if (this.config.enablePerformanceTracking && conversionTimeUs !== undefined) {
      this.stats._conversionTimes.push(conversionTimeUs);

      // Update peak time
      if (conversionTimeUs > this.stats.peakConversionTimeUs) {
        this.stats.peakConversionTimeUs = conversionTimeUs;
      }

      // Calculate average (keep last 1000 samples to avoid memory growth)
      if (this.stats._conversionTimes.length > 1000) {
        this.stats._conversionTimes.shift();
      }

      const sum = this.stats._conversionTimes.reduce((a, b) => a + b, 0);
      this.stats.avgConversionTimeUs = sum / this.stats._conversionTimes.length;
    }

    if (fieldsDropped > 0) {
      this.stats.totalFieldsDropped += fieldsDropped;
    }
  }

  /**
   * Measure conversion time and execute conversion
   *
   * @protected
   * @param {Function} conversionFn - The conversion function to execute
   * @returns {Object} Result with span and timing information
   */
  _measureConversion(conversionFn) {
    const startTime = process.hrtime.bigint();

    try {
      const result = conversionFn();
      const endTime = process.hrtime.bigint();
      const conversionTimeUs = Number(endTime - startTime) / 1000; // Convert nanoseconds to microseconds

      return {
        ...result,
        conversionTimeUs
      };
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const conversionTimeUs = Number(endTime - startTime) / 1000;

      throw Object.assign(error, { conversionTimeUs });
    }
  }
}

module.exports = SpanConverter;

// Made with Bob
