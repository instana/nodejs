/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// eslint-disable-next-line instana/no-unsafe-require, import/no-extraneous-dependencies
const readYamlFile = require('read-yaml-file');

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
