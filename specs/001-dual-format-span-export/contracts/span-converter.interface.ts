/**
 * Span Format Converter Interface
 * 
 * Defines the contract for converting between different span formats.
 * This interface enables extensibility for adding new span formats in the future.
 * 
 * @module contracts/span-converter
 */

import { InstanaBaseSpan } from '@instana/core';

/**
 * Supported span formats
 */
export enum SpanFormat {
  INSTANA = 'instana',
  OPENTELEMETRY = 'opentelemetry'
}

/**
 * Conversion result with metadata
 */
export interface ConversionResult<T = any> {
  /** The converted span */
  span: T;
  
  /** Conversion metadata */
  metadata: {
    /** Format the span was converted to */
    targetFormat: SpanFormat;
    
    /** Time taken for conversion (microseconds) */
    conversionTimeUs: number;
    
    /** Whether any fields were dropped during conversion */
    fieldsDropped: boolean;
    
    /** List of dropped field paths (if any) */
    droppedFields?: string[];
    
    /** Warnings generated during conversion */
    warnings?: string[];
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the span is valid */
  valid: boolean;
  
  /** Validation errors (if any) */
  errors: string[];
  
  /** Validation warnings (if any) */
  warnings?: string[];
}

/**
 * Converter statistics
 */
export interface ConverterStats {
  /** Total number of conversions performed */
  conversionsTotal: number;
  
  /** Number of successful conversions */
  conversionsSuccess: number;
  
  /** Number of failed conversions */
  conversionsFailed: number;
  
  /** Average conversion time (microseconds) */
  avgConversionTimeUs: number;
  
  /** Peak conversion time (microseconds) */
  peakConversionTimeUs: number;
  
  /** Total fields dropped across all conversions */
  totalFieldsDropped: number;
}

/**
 * Base interface for all span converters
 * 
 * Implementations must be stateless and thread-safe.
 */
export interface SpanConverter<TOutput = any> {
  /**
   * Get the target format this converter produces
   */
  getTargetFormat(): SpanFormat;
  
  /**
   * Get the format version this converter implements
   */
  getFormatVersion(): string;
  
  /**
   * Convert an Instana span to the target format
   * 
   * @param span - The Instana span to convert
   * @returns Conversion result with the converted span and metadata
   * @throws ConversionError if conversion fails
   */
  convert(span: InstanaBaseSpan): ConversionResult<TOutput>;
  
  /**
   * Validate a span in the target format
   * 
   * @param span - The span to validate
   * @returns Validation result
   */
  validate(span: TOutput): ValidationResult;
  
  /**
   * Get converter statistics
   * 
   * @returns Current statistics
   */
  getStats(): ConverterStats;
  
  /**
   * Reset converter statistics
   */
  resetStats(): void;
}

/**
 * Configuration for span conversion
 */
export interface SpanConverterConfig {
  /** Target span format */
  targetFormat: SpanFormat;
  
  /** Whether to validate spans after conversion */
  validateAfterConversion?: boolean;
  
  /** Whether to preserve Instana-specific fields in converted spans */
  preserveInstanaFields?: boolean;
  
  /** Maximum number of attributes per span */
  maxAttributeCount?: number;
  
  /** Maximum length of attribute values (characters) */
  maxAttributeValueLength?: number;
  
  /** Whether to enable performance tracking */
  enablePerformanceTracking?: boolean;
  
  /** Custom attribute transformers by protocol */
  customTransformers?: Record<string, AttributeTransformer>;
}

/**
 * Custom attribute transformer for specific protocols
 */
export interface AttributeTransformer {
  /** Protocol name (e.g., 'http', 'redis', 'kafka') */
  protocol: string;
  
  /**
   * Transform protocol-specific data to attributes
   * 
   * @param data - Protocol-specific data from Instana span
   * @returns Transformed attributes
   */
  transform(data: any): Record<string, AttributeValue>;
}

/**
 * Attribute value types supported by OpenTelemetry
 */
export type AttributeValue = 
  | string 
  | number 
  | boolean 
  | string[] 
  | number[] 
  | boolean[];

/**
 * Conversion error types
 */
export enum ConversionErrorType {
  VALIDATION_ERROR = 'validation_error',
  MAPPING_ERROR = 'mapping_error',
  TRANSFORMATION_ERROR = 'transformation_error',
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Error thrown during span conversion
 */
export class ConversionError extends Error {
  constructor(
    public readonly type: ConversionErrorType,
    public readonly message: string,
    public readonly spanId: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ConversionError';
    
    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConversionError);
    }
  }
}

/**
 * Registry for managing multiple span converters
 */
export interface SpanConverterRegistry {
  /**
   * Register a converter for a specific format
   * 
   * @param format - The span format
   * @param converter - The converter implementation
   */
  register(format: SpanFormat, converter: SpanConverter): void;
  
  /**
   * Get a converter for a specific format
   * 
   * @param format - The span format
   * @returns The converter, or undefined if not registered
   */
  get(format: SpanFormat): SpanConverter | undefined;
  
  /**
   * Check if a converter is registered for a format
   * 
   * @param format - The span format
   * @returns True if registered, false otherwise
   */
  has(format: SpanFormat): boolean;
  
  /**
   * Get all registered formats
   * 
   * @returns Array of registered formats
   */
  getRegisteredFormats(): SpanFormat[];
  
  /**
   * Convert a span to a specific format
   * 
   * @param span - The Instana span to convert
   * @param targetFormat - The target format
   * @returns Conversion result
   * @throws ConversionError if no converter is registered for the format
   */
  convert(span: InstanaBaseSpan, targetFormat: SpanFormat): ConversionResult;
}

/**
 * Factory for creating span converters
 */
export interface SpanConverterFactory {
  /**
   * Create a converter for a specific format
   * 
   * @param format - The target format
   * @param config - Converter configuration
   * @returns A new converter instance
   */
  create(format: SpanFormat, config?: SpanConverterConfig): SpanConverter;
}
