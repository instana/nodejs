/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const VERSIONS = {
  1.23: require('./v1.23'),
  1.41: require('./v1.41')
};

/**
 * Get the semantic convention lookup configuration for a specific version.
 *
 * @param {string} [version] - The semantic convention version (e.g., '1.23', '1.43')
 * @returns {Object} The compiled semantic convention mappings
 */
function getLookupConfig(version) {
  const targetVersion = version || '1.23';

  if (!VERSIONS[targetVersion]) {
    throw new Error(`Unknown semantic convention version: ${targetVersion}`);
  }

  return VERSIONS[targetVersion];
}

module.exports = {
  getLookupConfig
};
