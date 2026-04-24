/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * Registry for managing span converters
 *
 * Provides centralized management of span converters with support for:
 * - Registering converters by format
 * - Retrieving converters by format
 * - Listing available formats
 * - Converter lifecycle management
 *
 * @module tracing/converters/SpanConverterRegistry
 */

const { SpanFormat } = require('./types');

/**
 * Registry for span converters
 *
 * Singleton registry that manages all available span converters.
 * Converters are registered by their target format and can be
 * retrieved for span conversion operations.
 *
 * @class SpanConverterRegistry
 */
class SpanConverterRegistry {
  constructor() {
    /**
     * Map of format -> converter instance
     * @private
     * @type {Map<string, Object>}
     */
    this._converters = new Map();

    /**
     * Map of format -> converter factory function
     * @private
     * @type {Map<string, Function>}
     */
    this._factories = new Map();

    /**
     * Default format to use when none specified
     * @private
     * @type {string}
     */
    this._defaultFormat = SpanFormat.INSTANA;
  }

  /**
   * Register a converter for a specific format
   *
   * @param {string} format - Target format (from SpanFormat enum)
   * @param {Object} converter - Converter instance implementing SpanConverter interface
   * @throws {Error} If format is invalid or converter is already registered
   */
  register(format, converter) {
    if (!format || typeof format !== 'string') {
      throw new Error('Format must be a non-empty string');
    }

    if (!converter) {
      throw new Error('Converter instance is required');
    }

    // Validate converter implements required interface
    if (typeof converter.convert !== 'function') {
      throw new Error(`Converter for format '${format}' must implement convert() method`);
    }

    if (typeof converter.validate !== 'function') {
      throw new Error(`Converter for format '${format}' must implement validate() method`);
    }

    if (typeof converter.getTargetFormat !== 'function') {
      throw new Error(`Converter for format '${format}' must implement getTargetFormat() method`);
    }

    // Check if already registered
    if (this._converters.has(format)) {
      throw new Error(`Converter for format '${format}' is already registered`);
    }

    // Verify converter reports correct format
    const reportedFormat = converter.getTargetFormat();
    if (reportedFormat !== format) {
      throw new Error(`Converter format mismatch: registered as '${format}' but reports '${reportedFormat}'`);
    }

    this._converters.set(format, converter);
  }

  /**
   * Register a converter factory for lazy initialization
   *
   * @param {string} format - Target format
   * @param {Function} factory - Factory function that returns a converter instance
   * @throws {Error} If format is invalid or factory is already registered
   */
  registerFactory(format, factory) {
    if (!format || typeof format !== 'string') {
      throw new Error('Format must be a non-empty string');
    }

    if (typeof factory !== 'function') {
      throw new Error('Factory must be a function');
    }

    if (this._factories.has(format)) {
      throw new Error(`Factory for format '${format}' is already registered`);
    }

    this._factories.set(format, factory);
  }

  /**
   * Get converter for a specific format
   *
   * @param {string} format - Target format
   * @returns {Object|null} Converter instance or null if not found
   */
  get(format) {
    // Check if converter is already instantiated
    if (this._converters.has(format)) {
      return this._converters.get(format);
    }

    // Try to instantiate from factory
    if (this._factories.has(format)) {
      const factory = this._factories.get(format);
      try {
        const converter = factory();
        this._converters.set(format, converter);
        this._factories.delete(format); // Remove factory after instantiation
        return converter;
      } catch (error) {
        throw new Error(`Failed to instantiate converter for format '${format}': ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Check if a converter is registered for a format
   *
   * @param {string} format - Target format
   * @returns {boolean} True if converter is registered
   */
  has(format) {
    return this._converters.has(format) || this._factories.has(format);
  }

  /**
   * Unregister a converter
   *
   * @param {string} format - Target format
   * @returns {boolean} True if converter was unregistered
   */
  unregister(format) {
    const hadConverter = this._converters.delete(format);
    const hadFactory = this._factories.delete(format);
    return hadConverter || hadFactory;
  }

  /**
   * Get list of all registered formats
   *
   * @returns {Array<string>} Array of format names
   */
  getRegisteredFormats() {
    const formats = new Set([...this._converters.keys(), ...this._factories.keys()]);
    return Array.from(formats).sort();
  }

  /**
   * Get list of instantiated converters
   *
   * @returns {Array<string>} Array of format names with instantiated converters
   */
  getInstantiatedFormats() {
    return Array.from(this._converters.keys()).sort();
  }

  /**
   * Set the default format
   *
   * @param {string} format - Default format to use
   * @throws {Error} If format is not registered
   */
  setDefaultFormat(format) {
    if (!this.has(format)) {
      throw new Error(`Cannot set default format to '${format}': format not registered`);
    }
    this._defaultFormat = format;
  }

  /**
   * Get the default format
   *
   * @returns {string} Default format name
   */
  getDefaultFormat() {
    return this._defaultFormat;
  }

  /**
   * Get converter for default format
   *
   * @returns {Object|null} Default converter instance
   */
  getDefault() {
    return this.get(this._defaultFormat);
  }

  /**
   * Clear all registered converters and factories
   */
  clear() {
    this._converters.clear();
    this._factories.clear();
    this._defaultFormat = SpanFormat.INSTANA;
  }

  /**
   * Get registry statistics
   *
   * @returns {Object} Registry statistics
   */
  getStats() {
    return {
      totalRegistered: this.getRegisteredFormats().length,
      instantiated: this.getInstantiatedFormats().length,
      pending: this._factories.size,
      defaultFormat: this._defaultFormat,
      formats: this.getRegisteredFormats()
    };
  }

  /**
   * Convert statistics to JSON
   *
   * @returns {Object} JSON representation
   */
  toJSON() {
    return this.getStats();
  }

  /**
   * Get a human-readable string representation
   *
   * @returns {string} Formatted registry info
   */
  toString() {
    const stats = this.getStats();
    return (
      `SpanConverterRegistry: ${stats.totalRegistered} formats registered ` +
      `(${stats.instantiated} instantiated, ${stats.pending} pending), ` +
      `default: ${stats.defaultFormat}`
    );
  }
}

// Export singleton instance
const registry = new SpanConverterRegistry();

module.exports = registry;

// Made with Bob
