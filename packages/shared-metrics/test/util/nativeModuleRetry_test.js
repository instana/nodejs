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
function makeSandboxedBufferError() {
  const obj = {};
  Object.defineProperty(obj, 'concat', { value: function Buffer() {}, writable: false });
  try {
    obj.concat = function () {};
  } catch (e) {
    return e;
  }
}

describe('shared-metrics/util/nativeModuleRetry', function () {
  this.timeout(config.getTestTimeout());

  /** @type {Record<string, sinon.SinonStub>} */
  let logger;
  /** @type {typeof import('../../src/util/nativeModuleRetry')} */
  let nativeModuleRetry;

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
    promises: {
      cp: sinon.stub().resolves()
    }
  });

  beforeEach(() => {
    logger = {
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub()
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should emit "failed" without crashing when tar.x() throws synchronously due to non-writable Buffer.concat', done => {
    const sandboxedBufferError = makeSandboxedBufferError();
    expect(sandboxedBufferError).to.be.instanceof(TypeError);
    expect(sandboxedBufferError.message).to.include('read only property');

    nativeModuleRetry = proxyquire('../../src/util/nativeModuleRetry', {
      tar: { x: sinon.stub().throws(sandboxedBufferError) },
      '@instana/core': { uninstrumentedFs: makeFsStub() }
    });
    nativeModuleRetry.init({ logger });

    const emitter = nativeModuleRetry.loadNativeAddOn(makeOpts());

    emitter.once('failed', () => {
      expect(logger.warn.called).to.be.true;
      const warnMsg = logger.warn.args.flat().join(' ');
      expect(warnMsg).to.include('read only property');
      done();
    });

    emitter.once('loaded', () => {
      done(new Error('Expected "failed" event, got "loaded"'));
    });
  });
});
