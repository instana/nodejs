/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { expect } = require('chai');

const isExcludedFromInstrumentation = require('../../src/util/excludedFromInstrumentation');

describe('util.excludedFromInstrumentation', () => {
  let originalArgv1;

  beforeEach(() => {
    originalArgv1 = process.argv[1];
  });

  afterEach(() => {
    process.argv[1] = originalArgv1;
  });

  it('should exclude system npm executable', () => {
    expect(isExcluded('/usr/local/npm')).to.be.true;
  });

  it('should exclude npm in global bin folder', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/bin/npm')).to.be.true;
  });

  it('should exclude npm-cli', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/lib/node_modules/npm/bin/npm-cli')).to.be.true;
  });

  it('should exclude npm-cli with .js suffix', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/lib/node_modules/npm/bin/npm-cli.js')).to.be.true;
  });

  it('should exclude system yarn executable', () => {
    expect(isExcluded('/usr/local/yarn')).to.be.true;
  });

  it('should exclude yarn in global bin folder', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/bin/yarn')).to.be.true;
  });

  it('should exclude yarn installed in opt', () => {
    expect(isExcluded('/opt/yarn-v1.22.5/bin/yarn')).to.be.true;
  });

  it('should exclude yarn when called with .js suffix', () => {
    expect(isExcluded('/opt/yarn-v1.22.5/bin/yarn.js')).to.be.true;
  });

  it('should exclude yarn in node_modules/yarn/bin', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/lib/node_modules/yarn/bin/yarn.js')).to.be.true;
  });

  it('should exclude yarn cli.js', () => {
    expect(isExcluded('/home/somebody/.nvm/versions/node/v22.0.0/lib/node_modules/yarn/lib/cli.js')).to.be.true;
  });

  it('should not exclude other processes', () => {
    expect(isExcluded('/usr/local/not-npm')).to.be.false;
    expect(isExcluded('/usr/local/yarnx')).to.be.false;
    expect(isExcluded('/usr/local/npmx.js')).to.be.false;
  });

  describe('pino thread-stream worker detection', () => {
    let originalRequire;

    beforeEach(() => {
      originalRequire = require.cache[require.resolve('worker_threads')];
    });

    afterEach(() => {
      if (originalRequire) {
        require.cache[require.resolve('worker_threads')] = originalRequire;
      } else {
        delete require.cache[require.resolve('worker_threads')];
      }
      delete require.cache[require.resolve('../../src/util/excludedFromInstrumentation')];
    });

    it('should exclude Pino thread-stream worker with valid structure', () => {
      mockWorkerThreads({
        isMainThread: false,
        workerData: {
          filename: '/path/to/worker.js',
          workerData: {
            $context: {
              threadStreamVersion: '2.0.0'
            },
            target: 'pino-pretty'
          }
        }
      });

      const checkExclusion = require('../../src/util/excludedFromInstrumentation');
      expect(checkExclusion()).to.be.true;
    });

    it('should exclude Pino thread-stream worker with targets property', () => {
      mockWorkerThreads({
        isMainThread: false,
        workerData: {
          filename: '/path/to/worker.js',
          workerData: {
            $context: {
              threadStreamVersion: '2.1.0'
            },
            targets: [{ target: 'pino-pretty' }]
          }
        }
      });

      const checkExclusion = require('../../src/util/excludedFromInstrumentation');
      expect(checkExclusion()).to.be.true;
    });

    it('should not exclude main thread', () => {
      mockWorkerThreads({
        isMainThread: true,
        workerData: {
          filename: '/path/to/worker.js',
          workerData: {
            $context: {
              threadStreamVersion: '2.0.0'
            }
          }
        }
      });

      const checkExclusion = require('../../src/util/excludedFromInstrumentation');
      expect(checkExclusion()).to.be.false;
    });

    it('should not exclude worker without workerData', () => {
      mockWorkerThreads({
        isMainThread: false,
        workerData: null
      });

      const checkExclusion = require('../../src/util/excludedFromInstrumentation');
      expect(checkExclusion()).to.be.false;
    });

    it('should not exclude worker without filename', () => {
      mockWorkerThreads({
        isMainThread: false,
        workerData: {
          workerData: {
            $context: {
              threadStreamVersion: '2.0.0'
            }
          }
        }
      });

      const checkExclusion = require('../../src/util/excludedFromInstrumentation');
      expect(checkExclusion()).to.be.false;
    });

    it('should not exclude worker without nested workerData', () => {
      mockWorkerThreads({
        isMainThread: false,
        workerData: {
          filename: '/path/to/worker.js'
        }
      });

      const checkExclusion = require('../../src/util/excludedFromInstrumentation');
      expect(checkExclusion()).to.be.false;
    });

    it('should not exclude worker without $context', () => {
      mockWorkerThreads({
        isMainThread: false,
        workerData: {
          filename: '/path/to/worker.js',
          workerData: {
            someOtherProperty: 'value'
          }
        }
      });

      const checkExclusion = require('../../src/util/excludedFromInstrumentation');
      expect(checkExclusion()).to.be.false;
    });

    it('should not exclude worker without threadStreamVersion', () => {
      mockWorkerThreads({
        isMainThread: false,
        workerData: {
          filename: '/path/to/worker.js',
          workerData: {
            $context: {
              someOtherProperty: 'value'
            }
          }
        }
      });

      const checkExclusion = require('../../src/util/excludedFromInstrumentation');
      expect(checkExclusion()).to.be.false;
    });

    it('should not exclude non-Pino worker thread', () => {
      mockWorkerThreads({
        isMainThread: false,
        workerData: {
          customData: 'some other worker'
        }
      });

      const checkExclusion = require('../../src/util/excludedFromInstrumentation');
      expect(checkExclusion()).to.be.false;
    });

    function mockWorkerThreads(mockData) {
      const mockModule = {
        exports: mockData
      };
      require.cache[require.resolve('worker_threads')] = mockModule;
    }
  });

  function isExcluded(argv1) {
    process.argv[1] = argv1;
    return isExcludedFromInstrumentation();
  }
});
