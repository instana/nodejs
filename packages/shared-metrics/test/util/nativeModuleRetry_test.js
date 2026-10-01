/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noPreserveCache();
const path = require('path');
const os = require('os');
const fs = require('fs');
const zlib = require('zlib');

const config = require('@_local/core/test/config');

describe('shared-metrics/util/nativeModuleRetry', function () {
  this.timeout(config.getTestTimeout());

  let logger;
  /** @type {typeof import('../../src/util/nativeModuleRetry')} */
  let nativeModuleRetry;
  let originalDescriptor;

  const NON_EXISTENT_MODULE = 'instana-non-existent-native-addon-for-test';

  const makeOpts = () => ({
    nativeModuleName: NON_EXISTENT_MODULE,
    nativeModulePath: path.join(os.tmpdir(), 'instana-test', NON_EXISTENT_MODULE),
    nativeModuleParentPath: path.join(os.tmpdir(), 'instana-test'),
    moduleRoot: path.join(__dirname, '..', '..'),
    message: `could not load ${NON_EXISTENT_MODULE}`
  });

  const makeFsStub = () => ({
    stat: sinon.stub().callsFake((_p, cb) => cb(null, { isFile: () => true })),
    promises: { cp: sinon.stub().resolves() }
  });

  beforeEach(() => {
    logger = {
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub()
    };
    originalDescriptor = Object.getOwnPropertyDescriptor(Buffer, 'concat');
  });

  afterEach(() => {
    sinon.restore();
    if (originalDescriptor) {
      Object.defineProperty(Buffer, 'concat', originalDescriptor);
    }
  });

  it('should skip native addon extraction and emit "failed" when Buffer.concat is read-only', done => {
    const tarXStub = sinon.stub().resolves();

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
      try {
        expect(tarXStub.called).to.be.false;
        expect(logger.debug.called).to.be.true;

        const logged = logger.debug
          .getCalls()
          .some(call => typeof call.args[0] === 'string' && call.args[0].includes('Buffer.concat is non-writable'));
        expect(logged).to.be.true;
        done();
      } catch (err) {
        done(err);
      }
    });

    emitter.once('loaded', () => {
      done(new Error('Expected "failed" event, got "loaded"'));
    });
  });

  describe('handling immutable runtime environments', () => {
    let dummyTarGzPath;

    before(() => {
      dummyTarGzPath = path.join(os.tmpdir(), `dummy-${Date.now()}.tar.gz`);
      const emptyTar = Buffer.alloc(1024);
      const gzipped = zlib.gzipSync(emptyTar);
      fs.writeFileSync(dummyTarGzPath, gzipped);
    });

    after(() => {
      if (fs.existsSync(dummyTarGzPath)) {
        try {
          fs.unlinkSync(dummyTarGzPath);
          // eslint-disable-next-line no-empty
        } catch (_) {}
      }
    });

    it('should safely fail without crashing the process when Buffer.concat is frozen', done => {
      let isDone = false;
      const finishOnce = err => {
        if (!isDone) {
          isDone = true;
          // eslint-disable-next-line no-use-before-define
          process.removeListener('uncaughtException', uncaughtHandler);
          done(err);
        }
      };

      const fakePath = Object.assign({}, path, {
        join: (...args) => {
          const result = path.join(...args);
          // Redirect any .tar.gz lookup to the dummy archive created in before().
          return result.endsWith('.tar.gz') ? dummyTarGzPath : result;
        }
      });

      nativeModuleRetry = proxyquire('../../src/util/nativeModuleRetry', {
        path: fakePath,
        '@instana/core': {
          uninstrumentedFs: {
            stat: sinon.stub().callsFake((_p, cb) => cb(null, { isFile: () => true })),
            promises: { cp: sinon.stub().resolves() }
          }
        }
      });
      nativeModuleRetry.init({ logger });

      Object.defineProperty(Buffer, 'concat', {
        value: Buffer.concat,
        writable: false,
        configurable: true
      });

      const uncaughtHandler = err => {
        try {
          expect(err).to.be.an.instanceOf(TypeError);
          expect(err.message).to.match(/Cannot assign to read only property 'concat'|Cannot set property concat/);
          finishOnce();
        } catch (assertionErr) {
          finishOnce(assertionErr);
        }
      };

      process.prependListener('uncaughtException', uncaughtHandler);

      const emitter = nativeModuleRetry.loadNativeAddOn(makeOpts());

      emitter.once('failed', () => {
        finishOnce();
      });
    });
  });
});
