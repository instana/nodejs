/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const preloadFlags = require('../../src/util/getPreloadFlags');

describe('util.getPreloadFlags', () => {
  const originalNodeOptions = process.env.NODE_OPTIONS;
  const originalExecArgv = process.execArgv.slice();

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
    process.env.NODE_OPTIONS = originalNodeOptions;
    process.execArgv = originalExecArgv;
  });

  it('should return relevant flags from NODE_OPTIONS', () => {
    process.env.NODE_OPTIONS =
      "INSTANA_DEBUG=true node --require '@_local/collector/src/immediate.js' ./something/src/index.js";

    const result = preloadFlags.get();

    expect(result).equal("--require '@_local/collector/src/immediate.js'");
  });

  it('should return relevant flags from execArgv', () => {
    process.execArgv = ['--require', '@_local/collector/src/immediate.js'];

    const result = preloadFlags.get();

    expect(result).equal('--require @_local/collector/src/immediate.js');
  });

  it('should return relevant flags from both NODE_OPTIONS and execArgv', () => {
    process.env.NODE_OPTIONS = '--require /path/to/some/file';
    process.execArgv = ['--import', '/path/to/instana/node_modules/@_local/collector/esm-register.mjs'];

    const result = preloadFlags.get();

    expect(result).equal(
      '--require /path/to/some/file, --import /path/to/instana/node_modules/@_local/collector/esm-register.mjs'
    );
  });

  it('should return "noFlags" when no relevant flags are found', () => {
    process.env.NODE_OPTIONS = '--inspect value';
    process.execArgv = ['--anotherFlag', 'value'];

    const result = preloadFlags.get();

    expect(result).equal('noFlags');
  });

  it('should return "noFlags" when NODE_OPTIONS and execArgv are empty', () => {
    const result = preloadFlags.get();

    expect(result).equal('noFlags');
  });
});
