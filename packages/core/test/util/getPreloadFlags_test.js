/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;

const { getPreloadFlags } = require('../../src/util/getPreloadFlags');

describe('util.getPreloadFlags', () => {
  // Variables to store original values of NODE_OPTIONS and execArgv
  const originalNodeOptions = process.env.NODE_OPTIONS;
  const originalExecArgv = process.execArgv.slice(); // Slice to copy the array

  // Helper function to reset environment variables and execArgs
  const resetEnvironment = () => {
    process.env.NODE_OPTIONS = '';
    process.execArgv = [];
  };

  beforeEach(() => {
    resetEnvironment();
  });

  afterEach(() => {
    resetEnvironment();
  });

  after(() => {
    // Restore original NODE_OPTIONS and execArgv values after all tests
    process.env.NODE_OPTIONS = originalNodeOptions;
    process.execArgv = originalExecArgv;
  });

  it('should return relevant flags from process.env.NODE_OPTIONS', () => {
    process.env.NODE_OPTIONS =
      "INSTANA_DEBUG=true node --require '@instana/collector/src/immediate.js' ./dummy-app/src/index.js";

    const result = getPreloadFlags();

    expect(result).equal("--require '@instana/collector/src/immediate.js'");
  });

  it('should return relevant flags from process.execArgv', () => {
    process.execArgv = ['--require', '@instana/collector/src/immediate.js'];

    const result = getPreloadFlags();

    expect(result).equal('--require @instana/collector/src/immediate.js');
  });

  it('should return relevant flags from both NODE_OPTIONS and execArgv', () => {
    process.env.NODE_OPTIONS = '--require /path/to/some/file';
    process.execArgv = ['--import', '/path/to/instana/node_modules/@instana/collector/esm-register.mjs'];

    const result = getPreloadFlags();

    expect(result).equal(
      '--require /path/to/some/file, --import /path/to/instana/node_modules/@instana/collector/esm-register.mjs'
    );
  });

  it('should return "noFlags" when no relevant flags are found', () => {
    process.env.NODE_OPTIONS = '--inspect value';
    process.execArgv = ['--anotherFlag', 'value'];

    const result = getPreloadFlags();

    expect(result).equal('noFlags');
  });

  it('should return "noFlags" when NODE_OPTIONS and execArgv are empty', () => {
    const result = getPreloadFlags();

    expect(result).equal('noFlags');
  });
});
