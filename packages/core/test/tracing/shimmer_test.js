/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

let shimmer;
let shimmerConsoleErrorArgs;
let loggerStub;

const stubShimmerLogger = () => {
  /**
   * shimmer makes a copy of console.log, which is not compatible with sinon
   * we have to manually wrap console.error
   */
  delete require.cache[require.resolve('shimmer')];

  // eslint-disable-next-line no-console
  const orig = console.error;
  // eslint-disable-next-line no-console
  console.error = function () {
    shimmerConsoleErrorArgs = arguments;
    return orig.apply(this, arguments);
  };

  loggerStub = {
    warn: sinon.stub()
  };

  shimmer = proxyquire('../../src/tracing/shimmer', {});
  shimmer.init({ logger: loggerStub });
};

describe('tracing/shimmer', () => {
  beforeEach(() => {
    shimmerConsoleErrorArgs = null;
    stubShimmerLogger();
  });

  it('should succeed', () => {
    const library = {
      exists: sinon.stub()
    };

    const instrumentation = sinon.stub();
    instrumentation.callsFake(
      originalLibraryMethod =>
        function instrumented() {
          return originalLibraryMethod.apply(this, arguments);
        }
    );

    shimmer.wrap(library, 'exists', instrumentation);
    library.exists();

    expect(instrumentation.called).to.eql(true);
    expect(shimmerConsoleErrorArgs).to.not.exist;
    expect(loggerStub.warn.called).to.eql(false);
  });

  it('should log native shimmer error', () => {
    const library = {};
    const instrumentation = sinon.stub();
    instrumentation.callsFake(
      originalLibraryMethod =>
        function instrumented() {
          return originalLibraryMethod.apply(this, arguments);
        }
    );

    shimmer.wrap(library, 'doesnotexist', instrumentation);

    expect(instrumentation.called).to.eql(false);
    expect(shimmerConsoleErrorArgs).to.exist;
    expect(shimmerConsoleErrorArgs[0]).to.eql('no original function doesnotexist to wrap');
    expect(loggerStub.warn.called).to.eql(false);
  });

  it('should log instrumentation error', () => {
    const library = {
      exists: sinon.stub()
    };

    const instrumentation = sinon.stub();
    instrumentation.callsFake(
      () =>
        function instrumented() {
          throw new TypeError('oops');
        }
    );

    shimmer.wrap(library, 'exists', instrumentation);
    library.exists();

    expect(instrumentation.called).to.eql(true);
    expect(shimmerConsoleErrorArgs).to.not.exist;
    expect(loggerStub.warn.called).to.eql(true);
    expect(loggerStub.warn.getCall(0).args[0]).to.contain(
      'An internal error happend in the Instana Node.js collector. Please contact support. TypeError: oops'
    );
  });

  it('should throw library error', () => {
    const library = {
      exists: () => {
        throw new TypeError('oops');
      }
    };

    const instrumentation = sinon.stub();
    instrumentation.callsFake(
      originalLibraryMethod =>
        function instrumented() {
          return originalLibraryMethod.apply(this, arguments);
        }
    );

    shimmer.wrap(library, 'exists', instrumentation);

    let err;

    try {
      library.exists();
    } catch (_err) {
      err = _err;
    }

    expect(err).to.exist;
    expect(err.message).to.eql('oops');
    expect(instrumentation.called).to.eql(true);
    expect(shimmerConsoleErrorArgs).to.not.exist;
    expect(loggerStub.warn.called).to.eql(false);
  });

  it('[sync] should not fail when error happens after library call', () => {
    const library = {
      exists: () => sinon.stub()
    };

    const instrumentation = sinon.stub();
    instrumentation.callsFake(
      originalLibraryMethod =>
        function instrumented() {
          originalLibraryMethod.apply(this, arguments);
          throw new TypeError('ooops');
        }
    );

    shimmer.wrap(library, 'exists', instrumentation);
    library.exists();

    expect(instrumentation.called).to.eql(true);
    expect(shimmerConsoleErrorArgs).to.not.exist;
    expect(loggerStub.warn.called).to.eql(true);
    expect(loggerStub.warn.getCall(0).args[0]).to.contain(
      'An internal error happend in the Instana Node.js collector. Please contact support. TypeError: ooops'
    );
  });

  it('[async] should not fail when error happens after library call', () => {
    const library = {
      exists: () => {
        return Promise.resolve();
      }
    };

    const instrumentation = sinon.stub();
    instrumentation.callsFake(
      originalLibraryMethod =>
        function instrumented() {
          const result = originalLibraryMethod.apply(this, arguments);
          result.then(() => {
            throw new TypeError('ooops');
          });
          return result;
        }
    );

    shimmer.wrap(library, 'exists', instrumentation);
    library.exists();

    expect(instrumentation.called).to.eql(true);
    expect(shimmerConsoleErrorArgs).to.not.exist;
    expect(loggerStub.warn.called).to.eql(false);
  });
});
