/**
 * Configuration Schema for Span Format Export
 * 
 * Defines configuration options for controlling span format selection
 * and conversion behavior.
 * 
 * @module contracts/configuration
 */

import { SpanFormat } from './span-converter.interface';

/**
 * Main configuration for span format export
 */
export interface SpanFormatConfig {
  /** 
   * Target span format for export
   * @default 'instana'
   */
  spanFormat: SpanFormat;
  
  /**
   * OpenTelemetry-specific configuration
   * Only used when spanFormat is 'opentelemetry'
   */
  opentelemetry?: OTelConfig;
  
  /**
   * Performance and optimization settings
   */
  performance?: PerformanceConfig;
  
  /**
   * Validation settings
   */
  validation?: ValidationConfig;
  
  /**
   * Debugging and observability settings
   */
  observability?: ObservabilityConfig;
}

/**
 * OpenTelemetry-specific configuration
 */
export interface OTelConfig {
  /**
   * Semantic conventions version to use
   * @default '1.24.0'
   */
  semconvVersion?: string;
  
  /**
   * Resource attributes (service/host information)
   * These are added to all spans
   */
  resource?: ResourceConfig;
  
  /**
   * Instrumentation scope configuration
   */
  instrumentationScope?: InstrumentationScopeConfig;
  
  /**
   * Attribute limits and constraints
   */
  attributeLimits?: AttributeLimitsConfig;
  
  /**
   * Whether to preserve Instana-specific fields in converted spans
   * When true, fields like 'sy', 'b', 'ia' are preserved under 'instana.*' namespace
   * @default true
   */
  preserveInstanaFields?: boolean;
  
  /**
   * Custom attribute transformers by protocol
   * Allows overriding default transformation logic for specific protocols
   */
  customTransformers?: Record<string, string>;  // protocol -> transformer module path
  
  /**
   * Span name generation strategy
   * - 'semantic': Use semantic operation names (e.g., 'GET /api/users')
   * - 'technical': Use technical span names (e.g., 'node.http.server')
   * @default 'semantic'
   */
  spanNameStrategy?: 'semantic' | 'technical';
  
  /**
   * Whether to include span events
   * @default false
   */
  includeEvents?: boolean;
  
  /**
   * Whether to include span links
   * @default false
   */
  includeLinks?: boolean;
}

/**
 * Resource configuration
 */
export interface ResourceConfig {
  /**
   * Service name
   * @example 'my-service'
   */
  'service.name'?: string;
  
  /**
   * Service version
   * @example '1.0.0'
   */
  'service.version'?: string;
  
  /**
   * Service namespace (environment)
   * @example 'production'
   */
  'service.namespace'?: string;
  
  /**
   * Additional custom resource attributes
   */
  [key: string]: string | number | boolean | undefined;
}

/**
 * Instrumentation scope configuration
 */
export interface InstrumentationScopeConfig {
  /**
   * Library name
   * @default '@instana/core'
   */
  name?: string;
  
  /**
   * Library version
   * @default (auto-detected from package.json)
   */
  version?: string;
  
  /**
   * Schema URL for semantic conventions
   * @example 'https://opentelemetry.io/schemas/1.24.0'
   */
  schemaUrl?: string;
}

/**
 * Attribute limits configuration
 */
export interface AttributeLimitsConfig {
  /**
   * Maximum number of attributes per span
   * @default 128
   */
  maxAttributeCount?: number;
  
  /**
   * Maximum length of attribute keys (characters)
   * @default 256
   */
  maxAttributeKeyLength?: number;
  
  /**
   * Maximum length of string attribute values (characters)
   * @default 4096
   */
  maxAttributeValueLength?: number;
  
  /**
   * Maximum number of events per span
   * @default 128
   */
  maxEventCount?: number;
  
  /**
   * Maximum number of links per span
   * @default 128
   */
  maxLinkCount?: number;
  
  /**
   * Behavior when limits are exceeded
   * - 'truncate': Truncate values to fit within limits
   * - 'drop': Drop attributes/events/links that exceed limits
   * - 'error': Throw an error
   * @default 'truncate'
   */
  onLimitExceeded?: 'truncate' | 'drop' | 'error';
}

/**
 * Performance and optimization configuration
 */
export interface PerformanceConfig {
  /**
   * Enable lazy conversion (convert only when needed)
   * @default true
   */
  lazyConversion?: boolean;
  
  /**
   * Enable object pooling for span objects
   * @default true
   */
  enableObjectPooling?: boolean;
  
  /**
   * Object pool size
   * @default 100
   */
  objectPoolSize?: number;
  
  /**
   * Enable span name memoization (cache computed names)
   * @default true
   */
  enableSpanNameMemoization?: boolean;
  
  /**
   * Memoization cache size
   * @default 1000
   */
  memoizationCacheSize?: number;
  
  /**
   * Enable batch conversion (convert multiple spans at once)
   * @default false
   */
  enableBatchConversion?: boolean;
  
  /**
   * Batch size for batch conversion
   * @default 10
   */
  batchSize?: number;
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  /**
   * Validate spans before conversion
   * @default true
   */
  validateBeforeConversion?: boolean;
  
  /**
   * Validate spans after conversion
   * @default true
   */
  validateAfterConversion?: boolean;
  
  /**
   * Behavior when validation fails
   * - 'error': Throw an error
   * - 'warn': Log a warning and continue
   * - 'skip': Skip conversion and use original span
   * @default 'warn'
   */
  onValidationFailure?: 'error' | 'warn' | 'skip';
  
  /**
   * Strict mode (enforce all validation rules)
   * @default false
   */
  strictMode?: boolean;
}

/**
 * Observability configuration
 */
export interface ObservabilityConfig {
  /**
   * Enable conversion metrics tracking
   * @default true
   */
  enableMetrics?: boolean;
  
  /**
   * Enable debug logging for conversions
   * @default false
   */
  enableDebugLogging?: boolean;
  
  /**
   * Log level for conversion operations
   * @default 'info'
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  
  /**
   * Enable performance tracking
   * @default true
   */
  enablePerformanceTracking?: boolean;
  
  /**
   * Sample rate for performance tracking (0.0 - 1.0)
   * @default 0.1 (10%)
   */
  performanceTrackingSampleRate?: number;
  
  /**
   * Enable validation error reporting
   * @default true
   */
  reportValidationErrors?: boolean;
}

/**
 * Default configuration values
 */
export const DefaultSpanFormatConfig: Required<SpanFormatConfig> = {
  spanFormat: SpanFormat.INSTANA,
  
  opentelemetry: {
    semconvVersion: '1.24.0',
    resource: {},
    instrumentationScope: {
      name: '@instana/core'
    },
    attributeLimits: {
      maxAttributeCount: 128,
      maxAttributeKeyLength: 256,
      maxAttributeValueLength: 4096,
      maxEventCount: 128,
      maxLinkCount: 128,
      onLimitExceeded: 'truncate'
    },
    preserveInstanaFields: true,
    customTransformers: {},
    spanNameStrategy: 'semantic',
    includeEvents: false,
    includeLinks: false
  },
  
  performance: {
    lazyConversion: true,
    enableObjectPooling: true,
    objectPoolSize: 100,
    enableSpanNameMemoization: true,
    memoizationCacheSize: 1000,
    enableBatchConversion: false,
    batchSize: 10
  },
  
  validation: {
    validateBeforeConversion: true,
    validateAfterConversion: true,
    onValidationFailure: 'warn',
    strictMode: false
  },
  
  observability: {
    enableMetrics: true,
    enableDebugLogging: false,
    logLevel: 'info',
    enablePerformanceTracking: true,
    performanceTrackingSampleRate: 0.1,
    reportValidationErrors: true
  }
};

/**
 * Configuration builder for fluent API
 */
export class SpanFormatConfigBuilder {
  private config: Partial<SpanFormatConfig> = {};
  
  /**
   * Set the target span format
   */
  withFormat(format: SpanFormat): this {
    this.config.spanFormat = format;
    return this;
  }
  
  /**
   * Configure OpenTelemetry settings
   */
  withOTelConfig(config: Partial<OTelConfig>): this {
    this.config.opentelemetry = {
      ...this.config.opentelemetry,
      ...config
    };
    return this;
  }
  
  /**
   * Configure performance settings
   */
  withPerformanceConfig(config: Partial<PerformanceConfig>): this {
    this.config.performance = {
      ...this.config.performance,
      ...config
    };
    return this;
  }
  
  /**
   * Configure validation settings
   */
  withValidationConfig(config: Partial<ValidationConfig>): this {
    this.config.validation = {
      ...this.config.validation,
      ...config
    };
    return this;
  }
  
  /**
   * Configure observability settings
   */
  withObservabilityConfig(config: Partial<ObservabilityConfig>): this {
    this.config.observability = {
      ...this.config.observability,
      ...config
    };
    return this;
  }
  
  /**
   * Build the final configuration
   */
  build(): SpanFormatConfig {
    return {
      ...DefaultSpanFormatConfig,
      ...this.config
    };
  }
}

/**
 * Environment variable mapping for configuration
 */
export const ConfigEnvironmentVariables = {
  /** Span format selection */
  INSTANA_SPAN_FORMAT: 'spanFormat',
  
  /** OTel semantic conventions version */
  INSTANA_OTEL_SEMCONV_VERSION: 'opentelemetry.semconvVersion',
  
  /** Service name */
  INSTANA_SERVICE_NAME: 'opentelemetry.resource.service.name',
  
  /** Enable lazy conversion */
  INSTANA_LAZY_CONVERSION: 'performance.lazyConversion',
  
  /** Enable debug logging */
  INSTANA_DEBUG_CONVERSION: 'observability.enableDebugLogging',
  
  /** Validation mode */
  INSTANA_VALIDATION_MODE: 'validation.onValidationFailure'
} as const;
