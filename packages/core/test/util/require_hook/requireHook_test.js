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

    describe('real modules', function () {
      this.timeout(3500);
      it('must support loading of specific files within a module', () => {
        Object.keys(require.cache).forEach(key => {
          if (key.indexOf('express') !== -1) {
            delete require.cache[key];
          }
        });

        requireHook.init({ logger: testUtils.createFakeLogger() });
        // NOTE: Adapt to v5: file structure is different in v4 and v5
        //       v5 - https://github.com/expressjs/express/tree/master/lib
        //       v4 - https://github.com/expressjs/express/tree/4.x/lib
        const pattern = requireHook.buildFileNamePattern(['node_modules', 'express', 'lib', 'express.js']);
        requireHook.onFileLoad(pattern, hook);

        // Require the specific file that matches the pattern, not just 'express'
        // which loads index.js. This ensures the pattern is tested against the actual file.
        expect(require('express/lib/express')).to.be.a('function');

        expect(hook.callCount).to.equal(1);
        expect(hook.getCall(0).args[0]).to.be.a('function');
        expect(hook.getCall(0).args[0].name).to.equal('createApplication');
      });
    });

    it('must handle Windows paths with backslashes in onFileLoad patterns', () => {
      const testModule = { test: 'module' };
      const windowsPath =
        'C:\\Users\\johndoe\\Desktop\\code\\mongo-app\\node_modules\\mongodb-core\\lib\\connection\\pool.js';

      // Create a function that will be captured as origLoad
      const originalLoad = function () {
        return testModule;
      };

      // Create a mock Module that will be used when requireHook loads
      const mockModule = {
        _load: originalLoad,
        _resolveFilename: function () {
          return windowsPath;
        }
      };

      // Use proxyquire to inject the mocked Module before requireHook loads
      const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
        module: mockModule
      });

      requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
      // Use a pattern similar to mongodb.js that expects forward slashes
      requireHookWithMock.onFileLoad(/\/mongodb-core\/lib\/connection\/pool\.js/, hook);

      // After init(), mockModule._load is now patchedModuleLoad
      // Call it with a Windows absolute path - this should trigger the pattern match
      const result = mockModule._load(
        'C:\\Users\\johndoe\\Desktop\\code\\mongo-app\\node_modules\\mongodb-core\\lib\\connection\\pool.js'
      );

      // Verify the hook was called despite Windows path separators
      expect(hook.callCount).to.equal(1);
      expect(hook.getCall(0).args[0]).to.deep.equal(testModule);
      expect(hook.getCall(0).args[1]).to.equal(windowsPath);
      expect(result).to.deep.equal(testModule);

      requireHookWithMock.teardownForTestPurposes();
    });

    it('must extract module name correctly from Windows paths in onModuleLoad', () => {
      const path = require('path');
      const testMssqlModule = { test: 'mssql-module' };
      // Use a Windows path that will be normalized and matched
      // On non-Windows systems, path.isAbsolute() may return false for Windows paths,
      // so we need to ensure the path is treated as absolute in the test
      const windowsPath = 'C:\\Users\\johndoe\\Desktop\\code\\mongo-app\\node_modules\\mssql\\lib\\index.js';
      const windowsModuleName = 'C:\\Users\\johndoe\\Desktop\\code\\mongo-app\\node_modules\\mssql\\lib\\index.js';

      // Store the originalLoad function reference so we can ensure same object is returned
      let loadCallCount = 0;
      const originalLoad = function () {
        loadCallCount++;
        // Must return the same object reference each time to pass cache check
        return testMssqlModule;
      };

      // Create a mock Module that will be used when requireHook loads
      const mockModule = {
        _load: originalLoad,
        _resolveFilename: function () {
          // _resolveFilename receives the same arguments as _load was called with
          return windowsPath;
        }
      };

      // Mock path.isAbsolute to return true for Windows paths (even on non-Windows systems)
      const pathMock = {
        isAbsolute: function (p) {
          // Treat Windows absolute paths (C:\, D:\, etc.) as absolute
          if (/^[A-Za-z]:[\\/]/.test(p)) {
            return true;
          }
          return path.isAbsolute(p);
        },
        extname: path.extname,
        sep: path.sep
      };

      // Use proxyquire to inject the mocked Module and path before requireHook loads
      const requireHookWithMock = proxyquire('../../../src/util/requireHook', {
        module: mockModule,
        path: pathMock
      });

      requireHookWithMock.init({ logger: testUtils.createFakeLogger() });
      // Register hook for mssql module (similar to mssql.js)
      requireHookWithMock.onModuleLoad('mssql', hook);

      // After init(), mockModule._load is replaced with patchedModuleLoad
      // When we call it, patchedModuleLoad will:
      // 1. Extract module name from Windows path: 'C:\...\node_modules\mssql\lib\index.js' -> 'mssql'
      // 2. Call origLoad (our mock) which returns testMssqlModule
      // 3. Call _resolveFilename which returns windowsPath
      // 4. Check byModuleNameTransformers['mssql'] and call the hook
      const result = mockModule._load(windowsModuleName);

      // Verify origLoad was called
      expect(loadCallCount).to.equal(1);
      // Verify the hook was called (module name 'mssql' should be extracted from Windows path)
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
  });
});
