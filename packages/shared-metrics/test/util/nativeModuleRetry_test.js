/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const path = require('path');
const os = require('os');

const config = require('@_local/core/test/config');

describe('shared-metrics/util/nativeModuleRetry', function () {
  this.timeout(config.getTestTimeout());

  /** @type {Record<string, sinon.SinonStub>} */
  let logger;
  /** @type {typeof import('../../src/util/nativeModuleRetry')} */
  let nativeModuleRetry;
  /** @type {sinon.SinonStub} */
  let tarXStub;

  const NON_EXISTENT_MODULE = 'instana-non-existent-native-addon-for-test';

  const makeOpts = () => ({
    nativeModuleName: NON_EXISTENT_MODULE,
    nativeModulePath: path.join(os.tmpdir(), 'instana-test', NON_EXISTENT_MODULE),
    nativeModuleParentPath: path.join(os.tmpdir(), 'instana-test'),
    moduleRoot: path.join(__dirname, '..', '..'),
    message: `could not load ${NON_EXISTENT_MODULE}`
  });

  const makeFsStub = () => ({
    stat: sinon.stub().callsFake((_p, cb) => cb(null)),
    promises: { cp: sinon.stub().resolves() }
  });

  beforeEach(() => {
    logger = {
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub()
    };
    tarXStub = sinon.stub().resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should emit "failed" and never call tar.x() when Buffer.concat is non-writable', done => {
    // Make Buffer.concat non-writable to simulate the sandboxed environment
    // (e.g. n8n Task Runner freezes globals after its own init).
    const originalDescriptor = Object.getOwnPropertyDescriptor(Buffer, 'concat');
    Object.defineProperty(Buffer, 'concat', {
      value: Buffer.concat,
      writable: false,
      configurable: true
    });

    nativeModuleRetry = proxyquire('../../src/util/nativeModuleRetry', {
      tar: { x: tarXStub },
      '@instana/core': { uninstrumentedFs: makeFsStub() }
    });
    nativeModuleRetry.init({ logger });

    const emitter = nativeModuleRetry.loadNativeAddOn(makeOpts());

    emitter.once('failed', () => {
      // Restore before asserting so a failure doesn't leave Buffer frozen.
      Object.defineProperty(Buffer, 'concat', originalDescriptor);

      expect(tarXStub.called).to.be.false;
      expect(logger.warn.called).to.be.true;
      done();
    });

    emitter.once('loaded', () => {
      Object.defineProperty(Buffer, 'concat', originalDescriptor);
      done(new Error('Expected "failed" event, got "loaded"'));
    });
  });
});
