/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const path = require('path');
const sinon = require('sinon');
const expect = require('chai').expect;
const proxyquire = require('proxyquire');

describe('util/iitmHook', () => {
  let iitmHook;
  let fakeLogger;

  const registrySuffix = path.join('import-in-the-middle', 'lib', 'register.js');

  // Fake keys used to simulate additional IITM instances on disk.
  const fakeIitmKey1 = path.join('/project/node_modules', registrySuffix);
  const fakeIitmKey2 = path.join('/project/packages/core/node_modules', registrySuffix);

  let snapshotKeys;

  beforeEach(() => {
    iitmHook = proxyquire('../../src/util/iitmHook', {
      'import-in-the-middle': function FakeIitm() {}
    });

    fakeLogger = {
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub()
    };

    iitmHook.init({ logger: fakeLogger });

    // Snapshot and remove every real IITM registry entry so each test starts clean.
    snapshotKeys = Object.keys(require.cache).filter(k => k.endsWith(registrySuffix));
    snapshotKeys.forEach(k => delete require.cache[k]);
  });

  afterEach(() => {
    delete require.cache[fakeIitmKey1];
    delete require.cache[fakeIitmKey2];
    snapshotKeys.forEach(k => {
      if (!require.cache[k]) {
        require.cache[k] = { id: k, exports: {}, loaded: true };
      }
    });
  });

  describe('activate — IITM version-conflict detection', () => {
    it('should not debug when only one IITM instance is in the module cache', () => {
      iitmHook.activate();

      expect(fakeLogger.debug.called).to.be.false;
    });

    it('should debug when two IITM instances are found in the module cache', () => {
      require.cache[fakeIitmKey1] = { id: fakeIitmKey1, exports: {}, loaded: true };
      require.cache[fakeIitmKey2] = { id: fakeIitmKey2, exports: {}, loaded: true };

      iitmHook.activate();

      expect(fakeLogger.debug.calledOnce).to.be.true;
      const debugMessage = fakeLogger.debug.firstCall.args[0];
      expect(debugMessage).to.include('Multiple import-in-the-middle (IITM) instances detected');
      expect(debugMessage).to.include(fakeIitmKey1);
      expect(debugMessage).to.include(fakeIitmKey2);
    });

    it('should include both conflicting paths in the debug message', () => {
      require.cache[fakeIitmKey1] = { id: fakeIitmKey1, exports: {}, loaded: true };
      require.cache[fakeIitmKey2] = { id: fakeIitmKey2, exports: {}, loaded: true };

      iitmHook.activate();

      const debugMessage = fakeLogger.debug.firstCall.args[0];
      expect(debugMessage).to.include('Detected instances:');
      expect(debugMessage).to.include(`  - ${fakeIitmKey1}`);
      expect(debugMessage).to.include(`  - ${fakeIitmKey2}`);
    });
  });
});
