/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * OTLP Mappers - Main Entry Point
 *
 * This module provides version-specific OTLP semantic convention mappings.
 * The version can be controlled via the OTLP_SEMCONV_VERSION environment variable.
 *
 * Default version: v1.23
 *
 * To use a different version:
 * - Set environment variable: OTLP_SEMCONV_VERSION=v1.24
 * - Or create new version directory and mappers
 *
 * Example:
 *   const { OTLP, METADATA_MAPPINGS, MAPPINGS } = require('./mappers');
 */

const { loadMappers } = require('./version-loader');

// Load the appropriate version of mappers
const { OTLP, METADATA_MAPPINGS, MAPPINGS } = loadMappers();

module.exports = {
  METADATA_MAPPINGS,
  MAPPINGS,
  OTLP
};

// Made with Bob
