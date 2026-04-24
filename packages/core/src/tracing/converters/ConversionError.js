/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * Error class for span conversion failures
 *
 * Provides detailed error information when span conversion fails,
 * including error type, span context, and additional details.
 *
 * @module tracing/converters/ConversionError
 */

const { ConversionErrorType } = require('./types');

/**
 * Error thrown during span conversion
 *
 * @class ConversionError
 * @extends Error
 */
class ConversionError extends Error {
  /**
   * Create a new conversion error
   *
   * @param {string} type - Error type (from ConversionErrorType enum)
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

  /**
   * Create a validation error
   *
   * @static
   * @param {string} message - Error message
   * @param {string} spanId - Span ID
   * @param {Array<string>} [validationErrors] - List of validation errors
   * @returns {ConversionError} New validation error
   */
  static validationError(message, spanId, validationErrors) {
    return new ConversionError(ConversionErrorType.VALIDATION_ERROR, message, spanId, { validationErrors });
  }

  /**
   * Create a mapping error
   *
   * @static
   * @param {string} message - Error message
   * @param {string} spanId - Span ID
   * @param {string} [fieldPath] - Path to the field that failed mapping
   * @returns {ConversionError} New mapping error
   */
  static mappingError(message, spanId, fieldPath) {
    return new ConversionError(ConversionErrorType.MAPPING_ERROR, message, spanId, { fieldPath });
  }

  /**
   * Create a transformation error
   *
   * @static
   * @param {string} message - Error message
   * @param {string} spanId - Span ID
   * @param {Error} [cause] - Original error that caused the transformation failure
   * @returns {ConversionError} New transformation error
   */
  static transformationError(message, spanId, cause) {
    return new ConversionError(ConversionErrorType.TRANSFORMATION_ERROR, message, spanId, {
      cause: cause ? cause.message : undefined,
      stack: cause ? cause.stack : undefined
    });
  }

  /**
   * Create an unknown error
   *
   * @static
   * @param {string} message - Error message
   * @param {string} spanId - Span ID
   * @param {Error} [cause] - Original error
   * @returns {ConversionError} New unknown error
   */
  static unknownError(message, spanId, cause) {
    return new ConversionError(ConversionErrorType.UNKNOWN_ERROR, message, spanId, {
      cause: cause ? cause.message : undefined,
      stack: cause ? cause.stack : undefined
    });
  }

  /**
   * Convert error to JSON for logging
   *
   * @returns {Object} JSON representation of the error
   */
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      spanId: this.spanId,
      details: this.details,
      stack: this.stack
    };
  }

  /**
   * Get a user-friendly error message
   *
   * @returns {string} Formatted error message
   */
  toString() {
    let msg = `${this.name} [${this.type}]: ${this.message} (span: ${this.spanId})`;

    if (this.details) {
      if (this.details.validationErrors && Array.isArray(this.details.validationErrors)) {
        msg += `\n  Validation errors: ${this.details.validationErrors.join(', ')}`;
      }
      if (this.details.fieldPath) {
        msg += `\n  Field path: ${this.details.fieldPath}`;
      }
      if (this.details.cause) {
        msg += `\n  Caused by: ${this.details.cause}`;
      }
    }

    return msg;
  }
}

module.exports = ConversionError;

// Made with Bob
