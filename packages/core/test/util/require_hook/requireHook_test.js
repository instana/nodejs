/* eslint-env mocha */

'use strict';

var proxyquire = require('proxyquire');
var expect = require('chai').expect;
var sinon = require('sinon');

describe('util/requireHook', function() {
  var requireHook;
  var hook;

  beforeEach(function() {
    requireHook = proxyquire('../../../src/util/requireHook', {});
    hook = sinon.stub();
  });

  afterEach(function() {
    requireHook.teardownForTestPurposes();
  });

  describe('onModuleLoad', function() {
    it('must not inform aboute load modules when not initialized', function(done) {
      requireHook.onModuleLoad('./testModuleA', hook);
      setTimeout(function() {
        expect(hook.callCount).to.equal(0);
        done();
      }, 100);
      require('./testModuleA');
    });

    it('must not forcefully load modules', function(done) {
      requireHook.init();
      requireHook.onModuleLoad('./testModuleA', hook);

      setTimeout(function() {
        expect(hook.callCount).to.equal(0);
        done();
      }, 100);
    });

    it('must inform about loaded modules', function() {
      requireHook.init();
      requireHook.onModuleLoad('./testModuleA', hook);

      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    it('must not inform aboute loaded modules twice', function() {
      requireHook.init();
      requireHook.onModuleLoad('./testModuleA', hook);

      expect(require('./testModuleA')).to.equal('module a');
      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    it('must support loading of two separate modules', function() {
      requireHook.init();
      requireHook.onModuleLoad('./testModuleA', hook);
      requireHook.onModuleLoad('./testModuleB', hook);

      expect(require('./testModuleB')).to.equal('module b');
      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(2);
      expect(hook.getCall(0).args[0]).to.equal('module b');
      expect(hook.getCall(1).args[0]).to.equal('module a');
    });

    it('must support redefinition of module exports', function() {
      requireHook.init();
      requireHook.onModuleLoad('./testModuleA', hook);
      hook.returns('a');

      expect(require('./testModuleA')).to.equal('a');
      expect(require('./testModuleA')).to.equal('a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    it('must support require chains', function() {
      requireHook.init();
      requireHook.onModuleLoad('./testModuleA', hook);
      hook.returns('42');

      expect(require('./testModuleC')).to.equal('module c: 42');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });
  });

  describe('onFileLoad', function() {
    it('must not inform aboute load modules when not initialized', function(done) {
      requireHook.onFileLoad(/testModuleA/, hook);
      setTimeout(function() {
        expect(hook.callCount).to.equal(0);
        done();
      }, 100);
      require('./testModuleA');
    });

    it('must not forcefully load modules', function(done) {
      requireHook.init();
      requireHook.onFileLoad(/testModuleA/, hook);

      setTimeout(function() {
        expect(hook.callCount).to.equal(0);
        done();
      }, 100);
    });

    it('must inform about loaded modules', function() {
      requireHook.init();
      requireHook.onFileLoad(/testModuleA/, hook);

      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    it('must not inform aboute loaded modules twice', function() {
      requireHook.init();
      requireHook.onFileLoad(/testModuleA/, hook);

      expect(require('./testModuleA')).to.equal('module a');
      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    it('must support loading of two separate modules', function() {
      requireHook.init();
      requireHook.onFileLoad(/testModuleA/, hook);
      requireHook.onFileLoad(/testModuleB/, hook);

      expect(require('./testModuleB')).to.equal('module b');
      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(2);
      expect(hook.getCall(0).args[0]).to.equal('module b');
      expect(hook.getCall(1).args[0]).to.equal('module a');
    });

    it('must support redefinition of module exports', function() {
      requireHook.init();
      requireHook.onFileLoad(/testModuleA/, hook);
      hook.returns('a');

      expect(require('./testModuleA')).to.equal('a');
      expect(require('./testModuleA')).to.equal('a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    describe('real modules', function() {
      it('must support loading of specific files within a module', function() {
        requireHook.init();
        var pattern = requireHook.buildFileNamePattern(['node_modules', 'express', 'lib', 'router', 'route.js']);
        requireHook.onFileLoad(pattern, hook);

        expect(require('express')).to.be.a('function');

        expect(hook.callCount).to.equal(1);
        expect(hook.getCall(0).args[0]).to.be.a('function');
        expect(hook.getCall(0).args[0].name).to.equal('Route');
      });
    });
  });
});
