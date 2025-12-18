/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const proxyquire = require('proxyquire');
const expect = require('chai').expect;
const sinon = require('sinon');
const testUtils = require('../../test_util');

describe('util/requireHook', () => {
  let requireHook;
  let hook;

  beforeEach(() => {
    requireHook = proxyquire('../../../src/util/requireHook', {});
    hook = sinon.stub();
  });

  afterEach(() => {
    requireHook.teardownForTestPurposes();
  });

  describe('onModuleLoad', () => {
    it('must not inform aboute load modules when not initialized', done => {
      requireHook.onModuleLoad('./testModuleA', hook);
      setTimeout(() => {
        expect(hook.callCount).to.equal(0);
        done();
      }, 100);
      require('./testModuleA');
    });

    it('must not forcefully load modules', done => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onModuleLoad('./testModuleA', hook);

      setTimeout(() => {
        expect(hook.callCount).to.equal(0);
        done();
      }, 100);
    });

    it('must inform about loaded modules', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onModuleLoad('./testModuleA', hook);

      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    it('must not inform aboute loaded modules twice', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onModuleLoad('./testModuleA', hook);

      expect(require('./testModuleA')).to.equal('module a');
      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    it('must support loading of two separate modules', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onModuleLoad('./testModuleA', hook);
      requireHook.onModuleLoad('./testModuleB', hook);

      expect(require('./testModuleB')).to.equal('module b');
      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(2);
      expect(hook.getCall(0).args[0]).to.equal('module b');
      expect(hook.getCall(1).args[0]).to.equal('module a');
    });

    it('must support redefinition of module exports', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onModuleLoad('./testModuleA', hook);
      hook.returns('a');

      expect(require('./testModuleA')).to.equal('a');
      expect(require('./testModuleA')).to.equal('a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    it('must support require chains', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onModuleLoad('./testModuleA', hook);
      hook.returns('42');

      expect(require('./testModuleC')).to.equal('module c: 42');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });
  });

  describe('onFileLoad', () => {
    it('must not inform aboute load modules when not initialized', done => {
      requireHook.onFileLoad(/testModuleA/, hook);
      setTimeout(() => {
        expect(hook.callCount).to.equal(0);
        done();
      }, 100);
      require('./testModuleA');
    });

    it('must not forcefully load modules', done => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onFileLoad(/testModuleA/, hook);

      setTimeout(() => {
        expect(hook.callCount).to.equal(0);
        done();
      }, 100);
    });

    it('must inform about loaded modules', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onFileLoad(/testModuleA/, hook);

      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    it('must not inform aboute loaded modules twice', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onFileLoad(/testModuleA/, hook);

      expect(require('./testModuleA')).to.equal('module a');
      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });

    it('must support loading of two separate modules', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onFileLoad(/testModuleA/, hook);
      requireHook.onFileLoad(/testModuleB/, hook);

      expect(require('./testModuleB')).to.equal('module b');
      expect(require('./testModuleA')).to.equal('module a');

      expect(hook.callCount).to.equal(2);
      expect(hook.getCall(0).args[0]).to.equal('module b');
      expect(hook.getCall(1).args[0]).to.equal('module a');
    });

    it('must support redefinition of module exports', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onFileLoad(/testModuleA/, hook);
      hook.returns('a');

      expect(require('./testModuleA')).to.equal('a');
      expect(require('./testModuleA')).to.equal('a');

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.equal('module a');
    });
  });
});
