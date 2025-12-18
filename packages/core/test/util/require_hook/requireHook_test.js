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

    it('must handle errors in transformer functions gracefully', () => {
      const errorLogger = {
        ...testUtils.createFakeLogger(),
        error: sinon.stub()
      };
      requireHook.init({ logger: errorLogger });
      const errorHook = sinon.stub().throws(new Error('Transformer error'));
      requireHook.onModuleLoad('./testModuleA', errorHook);

      const result = require('./testModuleA');
      expect(result).to.equal('module a');
      expect(errorLogger.error.called).to.be.true;
      expect(errorLogger.error.getCall(0).args[0]).to.include('Cannot instrument');
    });

    it('must apply multiple transformers for same module in order', () => {
      const hook1 = sinon.stub().returns('transformed1');
      const hook2 = sinon.stub().returns('transformed2');
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onModuleLoad('./testModuleA', hook1);
      requireHook.onModuleLoad('./testModuleA', hook2);

      const result = require('./testModuleA');
      expect(hook1.called).to.be.true;
      expect(hook2.called).to.be.true;
      expect(hook2.getCall(0).args[0]).to.equal('transformed1');
      expect(result).to.equal('transformed2');
    });

    it('must use original exports when transformer returns undefined', () => {
      const undefinedHook = sinon.stub().returns(undefined);
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onModuleLoad('./testModuleA', undefinedHook);

      const result = require('./testModuleA');
      expect(result).to.equal('module a');
      expect(undefinedHook.called).to.be.true;
    });

    it('must use original exports when transformer returns null', () => {
      const nullHook = sinon.stub().returns(null);
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onModuleLoad('./testModuleA', nullHook);

      const result = require('./testModuleA');
      expect(result).to.equal('module a');
    });

    it('must handle mysql2/promise.js special case', () => {
      const testModule = { test: 'mysql2-promise' };
      const mysql2Path = '/path/to/node_modules/mysql2/promise.js';

      const mockModule = {
        _load: () => testModule,
        _resolveFilename: () => mysql2Path
      };

      const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
        module: mockModule
      });

      requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
      requireHookWithMock.onModuleLoad('mysql2/promise', hook);

      mockModule._load(mysql2Path);

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.deep.equal(testModule);

      requireHookWithMock.teardownForTestPurposes();
    });

    it('must handle stealthy require (module cache manipulation)', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onModuleLoad('./testModuleA', hook);

      require('./testModuleA');
      expect(hook.callCount).to.equal(1);

      const filename = require.resolve('./testModuleA');
      const originalExports = require.cache[filename].exports;
      const newExports = { stealthy: true };
      require.cache[filename].exports = newExports;

      const second = require('./testModuleA');
      expect(second).to.deep.equal(newExports);
      expect(hook.callCount).to.equal(1);

      require.cache[filename].exports = originalExports;
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

    it('must handle Windows paths with backslashes in onFileLoad patterns', () => {
      const testModule = { test: 'module' };
      const windowsPath =
        'C:\\Users\\johndoe\\Desktop\\code\\mongo-app\\node_modules\\mongodb-core\\lib\\connection\\pool.js';

      const originalLoad = function () {
        return testModule;
      };

      const mockModule = {
        _load: originalLoad,
        _resolveFilename: function () {
          return windowsPath;
        }
      };

      const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
        module: mockModule
      });

      requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
      requireHookWithMock.onFileLoad(/\/mongodb-core\/lib\/connection\/pool\.js/, hook);

      const result = mockModule._load(
        'C:\\Users\\johndoe\\Desktop\\code\\mongo-app\\node_modules\\mongodb-core\\lib\\connection\\pool.js'
      );

      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.deep.equal(testModule);
      expect(hook.getCall(0).args[1]).to.equal(windowsPath);
      expect(result).to.deep.equal(testModule);

      requireHookWithMock.teardownForTestPurposes();
    });

    it('must extract module name correctly from Windows paths in onModuleLoad', () => {
      const path = require('path');
      const testMssqlModule = { test: 'mssql-module' };
      const windowsPath = 'C:\\Users\\johndoe\\Desktop\\code\\mongo-app\\node_modules\\mssql\\lib\\index.js';
      const windowsModuleName = 'C:\\Users\\johndoe\\Desktop\\code\\mongo-app\\node_modules\\mssql\\lib\\index.js';

      let loadCallCount = 0;
      const originalLoad = function () {
        loadCallCount++;
        return testMssqlModule;
      };

      const mockModule = {
        _load: originalLoad,
        _resolveFilename: function () {
          return windowsPath;
        }
      };

      const pathMock = {
        isAbsolute: function (p) {
          if (/^[A-Za-z]:[\\/]/.test(p)) {
            return true;
          }
          return path.isAbsolute(p);
        },
        extname: path.extname,
        sep: path.sep
      };

      const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
        module: mockModule,
        path: pathMock
      });

      requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
      requireHookWithMock.onModuleLoad('mssql', hook);
      const result = mockModule._load(windowsModuleName);

      expect(loadCallCount).to.equal(1);
      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.deep.equal(testMssqlModule);
      expect(result).to.deep.equal(testMssqlModule);

      requireHookWithMock.teardownForTestPurposes();
    });

    describe('moduleName handling (relative, absolute, module name)', () => {
      it('must handle relative paths on Unix systems', () => {
        const testModule = { test: 'relative-module' };
        const relativePath = './testModuleA';
        const resolvedPath = '/Users/testuser/project/testModuleA.js';

        const originalLoad = function () {
          return testModule;
        };

        const mockModule = {
          _load: originalLoad,
          _resolveFilename: function () {
            return resolvedPath;
          }
        };

        const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
          module: mockModule
        });

        requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
        requireHookWithMock.onFileLoad(/testModuleA/, hook);

        // Call with relative path - should work because _resolveFilename returns absolute path
        mockModule._load(relativePath);

        expect(hook.callCount).to.equal(1);
        expect(hook.getCall(0).args[0]).to.deep.equal(testModule);
        expect(hook.getCall(0).args[1]).to.equal(resolvedPath);

        requireHookWithMock.teardownForTestPurposes();
      });

      it('must handle relative paths on Windows systems', () => {
        const testModule = { test: 'relative-module' };
        const relativePath = '.\\testModuleA';
        const resolvedPath = 'C:\\Users\\testuser\\project\\testModuleA.js';

        const originalLoad = function () {
          return testModule;
        };

        const mockModule = {
          _load: originalLoad,
          _resolveFilename: function () {
            return resolvedPath;
          }
        };

        const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
          module: mockModule
        });

        requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
        requireHookWithMock.onFileLoad(/testModuleA/, hook);

        // Call with Windows relative path - should work
        mockModule._load(relativePath);

        expect(hook.callCount).to.equal(1);
        expect(hook.getCall(0).args[0]).to.deep.equal(testModule);
        expect(hook.getCall(0).args[1]).to.equal(resolvedPath);

        requireHookWithMock.teardownForTestPurposes();
      });

      it('must handle module names that resolve to absolute paths on Unix', () => {
        const testModule = { test: 'mssql-module' };
        const moduleName = 'mssql';
        const resolvedPath = '/Users/testuser/project/node_modules/mssql/lib/index.js';

        const originalLoad = function () {
          return testModule;
        };

        const mockModule = {
          _load: originalLoad,
          _resolveFilename: function () {
            return resolvedPath;
          }
        };

        const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
          module: mockModule
        });

        requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
        requireHookWithMock.onModuleLoad('mssql', hook);

        // Call with module name - should extract 'mssql' from resolved path
        mockModule._load(moduleName);

        expect(hook.callCount).to.equal(1);
        expect(hook.getCall(0).args[0]).to.deep.equal(testModule);

        requireHookWithMock.teardownForTestPurposes();
      });

      it('must handle module names that resolve to absolute paths on Windows', () => {
        const path = require('path');
        const testModule = { test: 'mssql-module' };
        const moduleName = 'mssql';
        const resolvedPath = 'C:\\Users\\testuser\\project\\node_modules\\mssql\\lib\\index.js';

        const originalLoad = function () {
          return testModule;
        };

        const mockModule = {
          _load: originalLoad,
          _resolveFilename: function () {
            return resolvedPath;
          }
        };

        const pathMock = {
          isAbsolute: function (p) {
            if (/^[A-Za-z]:[\\/]/.test(p)) {
              return true;
            }
            return path.isAbsolute(p);
          },
          extname: path.extname,
          sep: path.sep
        };

        const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
          module: mockModule,
          path: pathMock
        });

        requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
        requireHookWithMock.onModuleLoad('mssql', hook);

        // Call with module name - should extract 'mssql' from Windows resolved path
        mockModule._load(moduleName);

        expect(hook.callCount).to.equal(1);
        expect(hook.getCall(0).args[0]).to.deep.equal(testModule);

        requireHookWithMock.teardownForTestPurposes();
      });

      it('must handle absolute Unix paths in onFileLoad', () => {
        const testModule = { test: 'unix-module' };
        const absolutePath = '/Users/testuser/project/node_modules/mongodb-core/lib/connection/pool.js';

        const originalLoad = function () {
          return testModule;
        };

        const mockModule = {
          _load: originalLoad,
          _resolveFilename: function () {
            return absolutePath;
          }
        };

        const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
          module: mockModule
        });

        requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
        requireHookWithMock.onFileLoad(/\/mongodb-core\/lib\/connection\/pool\.js/, hook);

        // Call with Unix absolute path
        mockModule._load(absolutePath);

        expect(hook.callCount).to.equal(1);
        expect(hook.getCall(0).args[0]).to.deep.equal(testModule);
        expect(hook.getCall(0).args[1]).to.equal(absolutePath);

        requireHookWithMock.teardownForTestPurposes();
      });

      it('must handle absolute Windows paths in onFileLoad', () => {
        const testModule = { test: 'windows-module' };
        const windowsPath = 'C:\\Users\\testuser\\project\\node_modules\\mongodb-core\\lib\\connection\\pool.js';

        const originalLoad = function () {
          return testModule;
        };

        const mockModule = {
          _load: originalLoad,
          _resolveFilename: function () {
            return windowsPath;
          }
        };

        const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
          module: mockModule
        });

        requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
        requireHookWithMock.onFileLoad(/\/mongodb-core\/lib\/connection\/pool\.js/, hook);

        // Call with Windows absolute path - should normalize and match
        mockModule._load(windowsPath);

        expect(hook.callCount).to.equal(1);
        expect(hook.getCall(0).args[0]).to.deep.equal(testModule);
        expect(hook.getCall(0).args[1]).to.equal(windowsPath);

        requireHookWithMock.teardownForTestPurposes();
      });

      it('must handle scoped module names (e.g., @scope/package) on Unix', () => {
        const testModule = { test: 'scoped-module' };
        const moduleName = '@elastic/elasticsearch';
        const resolvedPath = '/Users/testuser/project/node_modules/@elastic/elasticsearch/index.js';

        const originalLoad = function () {
          return testModule;
        };

        const mockModule = {
          _load: originalLoad,
          _resolveFilename: function () {
            return resolvedPath;
          }
        };

        const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
          module: mockModule
        });

        requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
        requireHookWithMock.onModuleLoad('@elastic/elasticsearch', hook);

        // Call with scoped module name - should extract '@elastic/elasticsearch' from resolved path
        mockModule._load(moduleName);

        expect(hook.callCount).to.equal(1);
        expect(hook.getCall(0).args[0]).to.deep.equal(testModule);

        requireHookWithMock.teardownForTestPurposes();
      });

      it('must handle scoped module names (e.g., @scope/package) on Windows', () => {
        const path = require('path');
        const testModule = { test: 'scoped-module' };
        const moduleName = '@elastic/elasticsearch';
        const resolvedPath = 'C:\\Users\\testuser\\project\\node_modules\\@elastic\\elasticsearch\\index.js';

        const originalLoad = function () {
          return testModule;
        };

        const mockModule = {
          _load: originalLoad,
          _resolveFilename: function () {
            return resolvedPath;
          }
        };

        const pathMock = {
          isAbsolute: function (p) {
            if (/^[A-Za-z]:[\\/]/.test(p)) {
              return true;
            }
            return path.isAbsolute(p);
          },
          extname: path.extname,
          sep: path.sep
        };

        const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
          module: mockModule,
          path: pathMock
        });

        requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
        requireHookWithMock.onModuleLoad('@elastic/elasticsearch', hook);

        // Call with scoped module name on Windows - should extract '@elastic/elasticsearch'
        mockModule._load(moduleName);

        expect(hook.callCount).to.equal(1);
        expect(hook.getCall(0).args[0]).to.deep.equal(testModule);

        requireHookWithMock.teardownForTestPurposes();
      });
    });

    it('must apply multiple file pattern transformers', () => {
      const hook1 = sinon.stub().returns('file1');
      const hook2 = sinon.stub().returns('file2');
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onFileLoad(/testModuleA/, hook1);
      requireHook.onFileLoad(/testModule/, hook2);

      const result = require('./testModuleA');
      expect(hook1.called).to.be.true;
      expect(hook2.called).to.be.true;
      expect(hook2.getCall(0).args[0]).to.equal('file1');
      expect(result).to.equal('file2');
    });

    it('must not call file pattern transformer when pattern does not match', () => {
      requireHook.init({ logger: testUtils.createFakeLogger() });
      requireHook.onFileLoad(/nonMatchingPattern/, hook);

      const result = require('./testModuleA');
      expect(result).to.equal('module a');
      expect(hook.callCount).to.equal(0);
    });

    it('must skip module name extraction for .node files', () => {
      const testModule = { test: 'native-module' };
      const nodePath = '/path/to/node_modules/some-module/build/Release/addon.node';

      const mockModule = {
        _load: () => testModule,
        _resolveFilename: () => nodePath
      };

      const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
        module: mockModule
      });

      requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
      requireHookWithMock.onModuleLoad('some-module', hook);

      mockModule._load(nodePath);

      expect(hook.callCount).to.equal(0);

      requireHookWithMock.teardownForTestPurposes();
    });

    it('must skip module name extraction for .json files', () => {
      const testModule = { test: 'json-module' };
      const jsonPath = '/path/to/node_modules/some-module/package.json';

      const mockModule = {
        _load: () => testModule,
        _resolveFilename: () => jsonPath
      };

      const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
        module: mockModule
      });

      requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
      requireHookWithMock.onModuleLoad('some-module', hook);

      mockModule._load(jsonPath);

      expect(hook.callCount).to.equal(0);

      requireHookWithMock.teardownForTestPurposes();
    });

    it('must skip module name extraction for .ts files', () => {
      const testModule = { test: 'typescript-module' };
      const tsPath = '/path/to/node_modules/some-module/index.ts';

      const mockModule = {
        _load: () => testModule,
        _resolveFilename: () => tsPath
      };

      const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
        module: mockModule
      });

      requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
      requireHookWithMock.onModuleLoad('some-module', hook);

      mockModule._load(tsPath);

      expect(hook.callCount).to.equal(0);

      requireHookWithMock.teardownForTestPurposes();
    });
  });
});
