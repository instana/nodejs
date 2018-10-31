/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire');

describe('cmdline', function() {
  var fs;
  var result;

  beforeEach(function() {
    fs = {
      readFileSync: sinon.stub()
    };
    result = null;
  });

  it('should not define name and args when procfile cannot be read', function() {
    fs.readFileSync.throws({ code: 'ENOENT' });
    req();
    expect(result.name).to.equal(undefined);
    expect(result.args).to.equal(undefined);
  });

  it('should split the command line', function() {
    fs.readFileSync.returns('node\u0000foo\u0000my app\u0000');
    req();
    expect(result.name).to.equal('node');
    expect(result.args).to.deep.equal(['foo', 'my app']);
  });

  it('should define args an empty array when there are no args', function() {
    fs.readFileSync.returns('node\u0000');
    req();
    expect(result.name).to.equal('node');
    expect(result.args).to.deep.equal([]);
  });

  it('should not fail when the file is empty', function() {
    fs.readFileSync.returns('');
    req();
    expect(result.name).to.equal('');
    expect(result.args).to.deep.equal([]);
  });

  it('should work with only one commandline argument', function() {
    fs.readFileSync.returns('node\u0000my app\u0000');
    req();
    expect(result.name).to.equal('node');
    expect(result.args).to.deep.equal(['my app']);
  });

  function req() {
    result = proxyquire('../src/cmdline', {
      fs: fs
    }).getCmdline();
  }
});
