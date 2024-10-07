/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { expect } = require('chai');

const isExcludedFromInstrumentation = require('../../src/util/excludedFromInstrumentation');

describe('util.excludedFromInstrumentation', () => {
  let originalArgv1;

  beforeEach(() => {
    originalArgv1 = process.argv[1];
  });

  afterEach(() => {
    process.argv[1] = originalArgv1;
  });

  it('should exclude system npm executable', () => {
    expect(isExcluded('/usr/local/npm')).to.be.true;
  });

  it('should exclude npm in global bin folder', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/bin/npm')).to.be.true;
  });

  it('should exclude npm-cli', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/lib/node_modules/npm/bin/npm-cli')).to.be.true;
  });

  it('should exclude npm-cli with .js suffix', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/lib/node_modules/npm/bin/npm-cli.js')).to.be.true;
  });

  it('should exclude system yarn executable', () => {
    expect(isExcluded('/usr/local/yarn')).to.be.true;
  });

  it('should exclude yarn in global bin folder', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/bin/yarn')).to.be.true;
  });

  it('should exclude yarn installed in opt', () => {
    expect(isExcluded('/opt/yarn-v1.22.5/bin/yarn')).to.be.true;
  });

  it('should exclude yarn when called with .js suffix', () => {
    expect(isExcluded('/opt/yarn-v1.22.5/bin/yarn.js')).to.be.true;
  });

  it('should exclude yarn in node_modules/yarn/bin', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/lib/node_modules/yarn/bin/yarn.js')).to.be.true;
  });

  it('should exclude yarn cli.js', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/lib/node_modules/yarn/lib/cli.js')).to.be.true;
  });

  it('should not exclude other processes', () => {
    expect(isExcluded('/usr/local/not-npm')).to.be.false;
    expect(isExcluded('/usr/local/yarnx')).to.be.false;
    expect(isExcluded('/usr/local/npmx.js')).to.be.false;
  });

  function isExcluded(argv1) {
    process.argv[1] = argv1;
    return isExcludedFromInstrumentation();
  }
});
