/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// eslint-disable-next-line instana/no-unsafe-require, import/no-extraneous-dependencies
const readYamlFile = require('read-yaml-file');
/**
 * We chose 'read-yaml-file' because it is lightweight (3.34 kB) and faster
 * compared to other YAML parsers. At the time of adding this, we considered
 * alternatives like 'yaml', 'js-yaml', etc., but found them to be larger in size
 * and slower in performance.
 *
 * Performance test results:
 * - yaml parsing took: 0.006560 seconds - Heavy & slow
 * - js-yaml parsing took: 0.001803 seconds - Better, but still larger (404 kB)
 * - read-yaml-file parsing took: 0.000536 seconds - Best option
 *
 */
/** @type {import('../core').GenericLogger} */
let logger;
/**
 * @param {import('../util/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

/**
 * Loads and parses a YAML file from the given path.
 * @param {string} filePath - The absolute path to the YAML file.
 */
exports.read = function read(filePath) {
  try {
    return readYamlFile.sync(filePath);
  } catch (error) {
    logger?.warn(`Error reading YAML file from ${filePath}: ${error?.message}`);
    return {};
  }
};
