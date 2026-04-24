/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * Configuration schema for span format export
 *
 * Defines configuration options for controlling span format selection
 * and conversion behavior between Instana and OpenTelemetry formats.
 *
 * @module config/spanFormatConfig
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
 * Default configuration values for span format export
 */
const defaultSpanFormatConfig = {
  // Target span format for export (default: Instana format for backward compatibility)
  spanFormat: SpanFormat.INSTANA,

  // OpenTelemetry-specific configuration (only used when spanFormat is 'opentelemetry')
  opentelemetry: {
    // Semantic conventions version
    semconvVersion: '1.24.0',

    // Resource attributes (service/host information)
    resource: {},

    // Instrumentation scope configuration
    instrumentationScope: {
      name: '@instana/core'
      // version: auto-detected from package.json
    },

    // Attribute limits and constraints
    attributeLimits: {
      maxAttributeCount: 128,
      maxAttributeKeyLength: 256,
      maxAttributeValueLength: 4096,
      maxEventCount: 128,
      maxLinkCount: 128,
      onLimitExceeded: 'truncate' // 'truncate' | 'drop' | 'error'
    },

    // Whether to preserve Instana-specific fields in converted spans
    preserveInstanaFields: true,

    // Span name generation strategy
    spanNameStrategy: 'semantic', // 'semantic' | 'technical'

    // Whether to include span events
    includeEvents: false,

    // Whether to include span links
    includeLinks: false
  },

  // Performance and optimization settings
  performance: {
    lazyConversion: true,
    enableObjectPooling: true,
    objectPoolSize: 100,
    enableSpanNameMemoization: true,
    memoizationCacheSize: 1000,
    enableBatchConversion: false,
    batchSize: 10
  },

  // Validation settings
  validation: {
    validateBeforeConversion: true,
    validateAfterConversion: true,
    onValidationFailure: 'warn', // 'error' | 'warn' | 'skip'
    strictMode: false
  },

  // Debugging and observability settings
  observability: {
    enableMetrics: true,
    enableDebugLogging: false,
    logLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
    enablePerformanceTracking: true,
    performanceTrackingSampleRate: 0.1,
    reportValidationErrors: true
  }
};

/**
 * Environment variable mapping for configuration
 */
const configEnvironmentVariables = {
  INSTANA_SPAN_FORMAT: 'spanFormat',
  INSTANA_OTEL_SEMCONV_VERSION: 'opentelemetry.semconvVersion',
  INSTANA_SERVICE_NAME: 'opentelemetry.resource.service.name',
  INSTANA_LAZY_CONVERSION: 'performance.lazyConversion',
  INSTANA_DEBUG_CONVERSION: 'observability.enableDebugLogging',
  INSTANA_VALIDATION_MODE: 'validation.onValidationFailure'
};

module.exports = {
  SpanFormat,
  defaultSpanFormatConfig,
  configEnvironmentVariables
};

// Made with Bob
