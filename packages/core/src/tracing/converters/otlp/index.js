/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Instana to OpenTelemetry OTLP Converter - Main Entry Point
 *
 * This module serves as the main entry point for the OTLP converter.
 * It re-exports the core conversion functions from transform-functions.js
 *
 * Architecture:
 * - index.js (this file): Main entry point, re-exports public API
 * - transform-functions.js: Core conversion logic and transformation functions
 * - transform-utils.js: Low-level utility functions (ID conversion, timestamps, etc.)
 * - mappers/: Mapping configurations for different span types
 *
 * Public API:
 * - convertInstanaSpanToOTLP: Converts a single Instana span to OTLP format
 * - convertInstanaSpanBatchToOTLP: Converts multiple Instana spans with resourceSpans structure
 */

const { convertInstanaSpanToOTLP, convertInstanaSpanBatchToOTLP } = require('./transform-functions');

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  // Main conversion functions
  convertInstanaSpanToOTLP,
  convertInstanaSpanBatchToOTLP
};

// Made with Bob
