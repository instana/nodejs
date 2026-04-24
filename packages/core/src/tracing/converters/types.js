/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * Type definitions for span format converters
 *
 * Defines interfaces and types for the span conversion system,
 * enabling conversion between Instana and OpenTelemetry formats.
 *
 * @module tracing/converters/types
 */

/**
 * Supported span formats
 * @enum {string}
 */
const SpanFormat = {
  INSTANA: 'instana',
  OPENTELEMETRY: 'opentelemetry'
};

/**
 * Conversion error types
 * @enum {string}
 */
const ConversionErrorType = {
  VALIDATION_ERROR: 'validation_error',
  MAPPING_ERROR: 'mapping_error',
  TRANSFORMATION_ERROR: 'transformation_error',
  UNKNOWN_ERROR: 'unknown_error'
};

/**
 * Error thrown during span conversion
 */
class ConversionError extends Error {
  /**
   * @param {string} type - Error type
   * @param {string} message - Error message
   * @param {string} spanId - Span ID where error occurred
   * @param {*} [details] - Additional error details
   */
  constructor(type, message, spanId, details) {
    super(message);
    this.name = 'ConversionError';
    this.type = type;
    this.spanId = spanId;
    this.details = details;

    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConversionError);
    }
  }
}

/**
 * @typedef {Object} ConversionMetadata
 * @property {string} targetFormat - Format the span was converted to
 * @property {number} conversionTimeUs - Time taken for conversion (microseconds)
 * @property {boolean} fieldsDropped - Whether any fields were dropped during conversion
 * @property {string[]} [droppedFields] - List of dropped field paths (if any)
 * @property {string[]} [warnings] - Warnings generated during conversion
 */

/**
 * @typedef {Object} ConversionResult
 * @property {*} span - The converted span
 * @property {ConversionMetadata} metadata - Conversion metadata
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the span is valid
 * @property {string[]} errors - Validation errors (if any)
 * @property {string[]} [warnings] - Validation warnings (if any)
 */

/**
 * @typedef {Object} ConverterStats
 * @property {number} conversionsTotal - Total number of conversions performed
 * @property {number} conversionsSuccess - Number of successful conversions
 * @property {number} conversionsFailed - Number of failed conversions
 * @property {number} avgConversionTimeUs - Average conversion time (microseconds)
 * @property {number} peakConversionTimeUs - Peak conversion time (microseconds)
 * @property {number} totalFieldsDropped - Total fields dropped across all conversions
 */

/**
 * @typedef {string|number|boolean|string[]|number[]|boolean[]} AttributeValue
 * Attribute value types supported by OpenTelemetry
 */

/**
 * @typedef {Object} AttributeTransformer
 * @property {string} protocol - Protocol name (e.g., 'http', 'redis', 'kafka')
 * @property {function(Object): Object.<string, AttributeValue>} transform - Transform function
 */

/**
 * @typedef {Object} SpanConverterConfig
 * @property {string} targetFormat - Target span format
 * @property {boolean} [validateAfterConversion] - Whether to validate spans after conversion
 * @property {boolean} [preserveInstanaFields] - Whether to preserve Instana-specific fields
 * @property {number} [maxAttributeCount] - Maximum number of attributes per span
 * @property {number} [maxAttributeValueLength] - Maximum length of attribute values (characters)
 * @property {boolean} [enablePerformanceTracking] - Whether to enable performance tracking
 * @property {Object.<string, AttributeTransformer>} [customTransformers] - Custom attribute transformers by protocol
 */

/**
 * Base interface for all span converters
 *
 * Implementations must be stateless and thread-safe.
 *
 * @interface SpanConverter
 */

/**
 * Get the target format this converter produces
 * @function
 * @name SpanConverter#getTargetFormat
 * @returns {string} The target format
 */

/**
 * Get the format version this converter implements
 * @function
 * @name SpanConverter#getFormatVersion
 * @returns {string} The format version
 */

/**
 * Convert an Instana span to the target format
 * @function
 * @name SpanConverter#convert
 * @param {Object} span - The Instana span to convert
 * @returns {ConversionResult} Conversion result with the converted span and metadata
 * @throws {ConversionError} if conversion fails
 */

/**
 * Validate a span in the target format
 * @function
 * @name SpanConverter#validate
 * @param {*} span - The span to validate
 * @returns {ValidationResult} Validation result
 */

/**
 * Get converter statistics
 * @function
 * @name SpanConverter#getStats
 * @returns {ConverterStats} Current statistics
 */

/**
 * Reset converter statistics
 * @function
 * @name SpanConverter#resetStats
 * @returns {void}
 */

/**
 * Registry for managing multiple span converters
 *
 * @interface SpanConverterRegistry
 */

/**
 * Register a converter for a specific format
 * @function
 * @name SpanConverterRegistry#register
 * @param {string} format - The span format
 * @param {SpanConverter} converter - The converter implementation
 * @returns {void}
 */

/**
 * Get a converter for a specific format
 * @function
 * @name SpanConverterRegistry#get
 * @param {string} format - The span format
 * @returns {SpanConverter|undefined} The converter, or undefined if not registered
 */

/**
 * Check if a converter is registered for a format
 * @function
 * @name SpanConverterRegistry#has
 * @param {string} format - The span format
 * @returns {boolean} True if registered, false otherwise
 */

/**
 * Get all registered formats
 * @function
 * @name SpanConverterRegistry#getRegisteredFormats
 * @returns {string[]} Array of registered formats
 */

/**
 * Convert a span to a specific format
 * @function
 * @name SpanConverterRegistry#convert
 * @param {Object} span - The Instana span to convert
 * @param {string} targetFormat - The target format
 * @returns {ConversionResult} Conversion result
 * @throws {ConversionError} if no converter is registered for the format
 */

/**
 * Factory for creating span converters
 *
 * @interface SpanConverterFactory
 */

/**
 * Create a converter for a specific format
 * @function
 * @name SpanConverterFactory#create
 * @param {string} format - The target format
 * @param {SpanConverterConfig} [config] - Converter configuration
 * @returns {SpanConverter} A new converter instance
 */

module.exports = {
  SpanFormat,
  ConversionErrorType,
  ConversionError
};

// Made with Bob
