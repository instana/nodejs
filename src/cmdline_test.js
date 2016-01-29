/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var sinon = require('sinon');
var proxyquire = require('proxyquire');

describe('cmdline', function() {
  var fs;
  var mod;

  beforeEach(function() {
    fs = {
      readFileSync: sinon.stub()
    };
    mod = null;
  });

  it('should not define name and args when procfile cannot be read', function() {
    fs.readFileSync.throws({code: 'ENOENT'});
    req();
    expect(mod.name).to.equal(undefined);
    expect(mod.args).to.equal(undefined);
  });

  it('should split the command line', function() {
    fs.readFileSync.returns('node\u0000foo\u0000my app\u0000');
    req();
    expect(mod.name).to.equal('node');
    expect(mod.args).to.deep.equal(['foo', 'my app']);
  });

  it('should define args an empty array when there are no args', function() {
    fs.readFileSync.returns('node\u0000');
    req();
    expect(mod.name).to.equal('node');
    expect(mod.args).to.deep.equal([]);
  });

  it('should not fail when the file is empty', function() {
    fs.readFileSync.returns('');
    req();
    expect(mod.name).to.equal('');
    expect(mod.args).to.deep.equal([]);
  });

  it('should work with only one commandline argument', function() {
    fs.readFileSync.returns('node\u0000my app\u0000');
    req();
    expect(mod.name).to.equal('node');
    expect(mod.args).to.deep.equal(['my app']);
  });

  function req() {
    mod = proxyquire('./cmdline', {
      fs: fs
    });
  }
});
