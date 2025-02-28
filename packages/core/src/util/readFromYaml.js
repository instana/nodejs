/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const yaml = require('yaml');
const fs = require('../uninstrumentedFs');
const path = require('path');

/**
 * Reads and parses a YAML file from the specified path and parsed YAML content as a JavaScript object.
 * @param {string} yamlPath - The path to the YAML file (relative or absolute).
 */
function readFromYaml(yamlPath) {
  try {
    const configPath = path.resolve(__dirname, yamlPath);
    const fileContents = fs.readFileSync(configPath, 'utf8');
    return yaml.parse(fileContents);
  } catch (error) {
    throw new Error(`Failed to read or parse YAML file at ${yamlPath}: ${error?.message}`);
  }
}

module.exports = { readFromYaml };
