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

  // Real lib/register.js entries that may be in require.cache when the full suite runs.
  // We snapshot them before each test so we have full control over what the detector sees.
  let snapshotKeys;

  beforeEach(() => {
    // Load a fresh module instance to avoid state leaking between tests.
    iitmHook = proxyquire('../../src/util/iitmHook', {
      // Suppress real import-in-the-middle side-effects; return a no-op constructor.
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
    // Remove fake entries added during the test.
    delete require.cache[fakeIitmKey1];
    delete require.cache[fakeIitmKey2];
    // Restore the real entries that were snapshotted in beforeEach.
    snapshotKeys.forEach(k => {
      if (!require.cache[k]) {
        require.cache[k] = { id: k, exports: {}, loaded: true };
      }
    });
  });

  describe('activate — IITM version-conflict detection', () => {
    it('should not warn when only one IITM instance is in the module cache', () => {
      // No registry entries in cache at all — no conflict.
      iitmHook.activate();

      expect(fakeLogger.warn.called).to.be.false;
    });

    it('should warn when two IITM instances are found in the module cache', () => {
      // Simulate a second IITM copy (e.g. v2 hoisted by npm) sitting at the project root.
      require.cache[fakeIitmKey1] = { id: fakeIitmKey1, exports: {}, loaded: true };
      require.cache[fakeIitmKey2] = { id: fakeIitmKey2, exports: {}, loaded: true };

      iitmHook.activate();

      expect(fakeLogger.warn.calledOnce).to.be.true;
      const warnMessage = fakeLogger.warn.firstCall.args[0];
      expect(warnMessage).to.include('Multiple import-in-the-middle (IITM) instances detected');
      expect(warnMessage).to.include(fakeIitmKey1);
      expect(warnMessage).to.include(fakeIitmKey2);
    });

    it('should include both conflicting paths in the warning message', () => {
      require.cache[fakeIitmKey1] = { id: fakeIitmKey1, exports: {}, loaded: true };
      require.cache[fakeIitmKey2] = { id: fakeIitmKey2, exports: {}, loaded: true };

      iitmHook.activate();

      const warnMessage = fakeLogger.warn.firstCall.args[0];
      expect(warnMessage).to.include('Detected instances:');
      expect(warnMessage).to.include(`  - ${fakeIitmKey1}`);
      expect(warnMessage).to.include(`  - ${fakeIitmKey2}`);
    });
  });
});
