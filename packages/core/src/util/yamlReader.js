/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// eslint-disable-next-line instana/no-unsafe-require, import/no-extraneous-dependencies
const path = require('path');

/**
 * We chose 'read-yaml-file' because it is lightweight (3.34 kB) and faster
 * compared to other YAML parsers. At the time of adding this, we considered
 * alternatives like 'yaml', 'js-yaml', etc., but found them to be larger in size
 * and slower in performance. 'read-yaml-file' and "js-yaml" had no releases for 4y.
 * If we have to replace the library in the future, we can easily do so.
 *
 * Performance test results:
 * - yaml parsing took: 0.006560 seconds - Heavy & slow
 * - js-yaml parsing took: 0.001803 seconds - Better, but still larger (404 kB)
 * - read-yaml-file parsing took: 0.000536 seconds - Best option
 *
 */

/** @type {import('../instanaCtr').InstanaCtrType} */
let instanaCtr;

/**
 * @param {import('../instanaCtr').InstanaCtrType} _instanaCtr
 */
exports.init = function init(_instanaCtr) {
  instanaCtr = _instanaCtr;
};

/**
 * Loads and parses a YAML file from the given path.
 * @param {string} filePath - The absolute path to the YAML file.
 */
exports.read = function read(filePath) {
  try {
    if (!path.isAbsolute(filePath)) {
      instanaCtr.logger().warn(`The file path is not absolute. Expected an absolute path, but received: ${filePath}`);
      return {};
    }

    // Requiring this pkg increases memory by ~4mb
    // We only need this package shortly if we have to read a YAML file.
    const readYamlFile = require('read-yaml-file');
    const result = readYamlFile.sync(filePath);

    // Release memory straight away
    delete require.cache[require.resolve('read-yaml-file')];
    return result;
  } catch (error) {
    instanaCtr.logger().warn(`Error reading YAML file from ${filePath}: ${error?.message}`);
    return {};
  }
};
