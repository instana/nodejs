/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const { readFromYaml } = require('../../src/util/readFromYaml');

describe('readFromYaml', () => {
  const validYamlPath = path.resolve(__dirname, './valid.yaml');
  const invalidYamlPath = path.resolve(__dirname, './invalid.yaml');
  const nonExistentYamlPath = path.resolve(__dirname, './nonexistent.yaml');

  before(() => {
    fs.writeFileSync(validYamlPath, 'key: value\nanotherKey: anotherValue');
    fs.writeFileSync(invalidYamlPath, 'key: value\ninvalidYAML: : :');
  });

  after(() => {
    fs.unlinkSync(validYamlPath);
    fs.unlinkSync(invalidYamlPath);
  });

  it('should read and parse a valid YAML file', () => {
    const result = readFromYaml(validYamlPath);
    expect(result).to.be.an('object');
    expect(result).to.deep.equal({ key: 'value', anotherKey: 'anotherValue' });
  });

  it('should throw an error if the YAML file does not exist', () => {
    expect(() => readFromYaml(nonExistentYamlPath)).to.throw(
      Error,
      `Failed to read or parse YAML file at ${nonExistentYamlPath}`
    );
  });

  it('should throw an error if the YAML file is malformed', () => {
    expect(() => readFromYaml(invalidYamlPath)).to.throw(
      Error,
      `Failed to read or parse YAML file at ${invalidYamlPath}`
    );
  });

  it('should throw an error if the YAML file path is not provided (undefined)', () => {
    expect(() => readFromYaml(undefined)).to.throw(Error, 'Failed to read or parse YAML file at undefined');
  });

  it('should throw an error if the YAML file path is not provided (null)', () => {
    expect(() => readFromYaml(null)).to.throw(Error, 'Failed to read or parse YAML file at null');
  });

  it('should throw an error if the YAML file path is an empty string', () => {
    expect(() => readFromYaml('')).to.throw(Error, 'Failed to read or parse YAML file at ');
  });
});
