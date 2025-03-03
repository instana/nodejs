/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// eslint-disable-next-line instana/no-unsafe-require, import/no-extraneous-dependencies
const yaml = require('yaml');
const fs = require('../uninstrumentedFs');
const path = require('path');

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
 * @param {string} filePath - The relative or absolute path to the YAML file.
 */
exports.read = function read(filePath) {
  try {
    const absolutePath = path.resolve(__dirname, filePath);
    const fileContent = fs.readFileSync(absolutePath, 'utf8');
    return yaml.parse(fileContent);
  } catch (error) {
    logger?.warn('Error loading YAML file', error?.message);
    return {};
  }
};
