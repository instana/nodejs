/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Version Loader for OTLP Mappers
 *
 * This module provides version-specific loading of OTLP lookup tables and mappers.
 * It allows switching between different OTLP semantic convention versions.
 *
 * Current supported versions:
 * - v1.23 (default)
 *
 * Future versions can be added by:
 * 1. Creating a new directory: mappers/vX.XX/
 * 2. Adding lookup.js, metadata-mapper.js, and span-data-mapper.js
 * 3. Setting OTLP_SEMCONV_VERSION environment variable or updating DEFAULT_VERSION
 */

// Default version to use if not specified
const DEFAULT_VERSION = 'v1.23';

// Cache for loaded versions to avoid repeated require() calls
const versionCache = {};

/**
 * Get the OTLP semantic convention version to use
 * Can be overridden via environment variable: OTLP_SEMCONV_VERSION
 *
 * @returns {string} Version string (e.g., 'v1.23')
 */
function getVersion() {
  // In futire we can switch the version something like return config.OTLP_SEMCONV_VERSION || DEFAULT_VERSION;
  return DEFAULT_VERSION;
}

/**
 * Load version-specific mappers
 *
 * @param {string} [version] - Optional version override
 * @returns {Object} Object containing OTLP, METADATA_MAPPINGS, and MAPPINGS
 * @throws {Error} If version directory or files don't exist
 */
function loadMappers(version) {
  const targetVersion = version || getVersion();

  // Return cached version if already loaded
  if (versionCache[targetVersion]) {
    return versionCache[targetVersion];
  }

  try {
    // Load version-specific files
    const { OTLP } = require(`./${targetVersion}/lookup`);
    const { METADATA_MAPPINGS } = require(`./${targetVersion}/metadata-mapper`);
    const { MAPPINGS } = require(`./${targetVersion}/span-data-mapper`);

    // Cache the loaded version
    const loadedMappers = {
      OTLP,
      METADATA_MAPPINGS,
      MAPPINGS,
      version: targetVersion
    };

    versionCache[targetVersion] = loadedMappers;

    return loadedMappers;
  } catch (error) {
    throw new Error(
      `Failed to load OTLP mappers for version '${targetVersion}'. ` +
        `Ensure the directory 'mappers/${targetVersion}' exists with required files. ` +
        `Error: ${error.message}`
    );
  }
}

/**
 * Get the current active version
 *
 * @returns {string} Current version string
 */
function getCurrentVersion() {
  return getVersion();
}

/**
 * Clear the version cache (useful for testing)
 */
function clearCache() {
  Object.keys(versionCache).forEach(key => {
    delete versionCache[key];
  });
}

module.exports = {
  loadMappers,
  getVersion,
  getCurrentVersion,
  clearCache,
  DEFAULT_VERSION
};

// Made with Bob
