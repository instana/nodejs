/* eslint-env mocha */

'use strict';

var proxyquire = require('proxyquire');
var expect = require('chai').expect;
var sinon = require('sinon');

describe('util/requireHook', function() {
  var requireHook;
  var hook;

  beforeEach(function() {
    requireHook = proxyquire('../../src/util/requireHook', {});
    hook = sinon.spy();
  });

  afterEach(function() {
    requireHook.teardown();
  });

  it('must not inform aboute load modules when not initialized', function(done) {
    requireHook.on('./testModuleA', hook);
    setTimeout(function() {
      expect(hook.callCount).to.equal(0);
      done();
    }, 100);
    require('./testModuleA');
  });

  it('must not forcefully load modules', function(done) {
    requireHook.init();
    requireHook.on('./testModuleA', hook);

    setTimeout(function() {
      expect(hook.callCount).to.equal(0);
      done();
    }, 100);
  });

  it('must inform about loaded mofules', function() {
    requireHook.init();
    requireHook.on('./testModuleA', hook);

    require('./testModuleA');

    expect(hook.callCount).to.equal(1);
    expect(hook.getCall(0).args[0]).to.equal('module a');
  });

  it('must not inform aboute loaded modules twice', function() {
    requireHook.init();
    requireHook.on('./testModuleA', hook);
    require('./testModuleA');

    require('./testModuleA');

    expect(hook.callCount).to.equal(1);
    expect(hook.getCall(0).args[0]).to.equal('module a');
  });

  it('must support about loading of two separate modules', function() {
    requireHook.init();
    requireHook.on('./testModuleA', hook);
    requireHook.on('./testModuleB', hook);

    require('./testModuleB');
    require('./testModuleA');

    expect(hook.callCount).to.equal(2);
    expect(hook.getCall(0).args[0]).to.equal('module b');
    expect(hook.getCall(1).args[0]).to.equal('module a');
  });
});
