/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('cmdline', () => {
  let fs;
  let result;

  beforeEach(() => {
    fs = {
      readFileSync: sinon.stub()
    };
    result = null;
  });

  it('should not define name and args when procfile cannot be read', () => {
    fs.readFileSync.throws({ code: 'ENOENT' });
    req();
    expect(result.name).to.equal(undefined);
    expect(result.args).to.equal(undefined);
  });

  it('should split the command line', () => {
    fs.readFileSync.returns('node\u0000foo\u0000my app\u0000');
    req();
    expect(result.name).to.equal('node');
    expect(result.args).to.deep.equal(['foo', 'my app']);
  });

  it('should define args an empty array when there are no args', () => {
    fs.readFileSync.returns('node\u0000');
    req();
    expect(result.name).to.equal('node');
    expect(result.args).to.deep.equal([]);
  });

  it('should not fail when the file is empty', () => {
    fs.readFileSync.returns('');
    req();
    expect(result.name).to.equal('');
    expect(result.args).to.deep.equal([]);
  });

  it('should work with only one commandline argument', () => {
    fs.readFileSync.returns('node\u0000my app\u0000');
    req();
    expect(result.name).to.equal('node');
    expect(result.args).to.deep.equal(['my app']);
  });

  function req() {
    result = proxyquire('../src/cmdline', {
      '@_local/core': {
        uninstrumentedFs: fs
      },

      // We need to proxyquire logger, too, to work around the duplicate module logger name check.
      './logger': proxyquire('../src/logger', {})
    }).getCmdline();
  }
});
