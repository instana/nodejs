/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const Module = require('module');
const dirname = require('path').dirname;
const join = require('path').join;
const resolve = require('path').resolve;
const pathsep = require('path').sep;
const getCallerFile = require('get-caller-file');
const normalize = require('normalize-path');
const originalLoader = Module._load;

// NOTE: mock-require is archivd on npm. Local copy is used.
// NOTE: Removed local mock-require cache. The library should not cache native require cache.
//       Otherwise it won't be notified about removals.
let pendingMockExports = {};

Module._load = function (request, parent) {
  if (!parent) return originalLoader.apply(this, arguments);

  const fullFilePath = getFullPathNormalized(request, parent.filename);
  let toExport;

  // eslint-disable-next-line no-prototype-builtins
  if (pendingMockExports.hasOwnProperty(fullFilePath)) {
    const mockPath = pendingMockExports[fullFilePath];

    // NOTE: To prevent infinite recursion caused by calling `require()` within the overridden
    // Module._load, we explicitly use the original unpatched loader to load the mock module.
    // This is especially important when mocking modules using absolute paths, such as those
    // from the root-level node_modules. Calling `require()` here would invoke this same function
    // again, leading to a stack overflow. Using `originalLoader` avoids triggering the hook itself.
    toExport = typeof mockPath === 'string' ? originalLoader(mockPath, parent) : mockPath;
  }

  return toExport || originalLoader.apply(this, arguments);
};

function startMocking(path, mockExport) {
  const calledFrom = getCallerFile();

  if (typeof mockExport === 'string') {
    mockExport = getFullPathNormalized(mockExport, calledFrom);
  }
  pendingMockExports[getFullPathNormalized(path, calledFrom)] = mockExport;
}

function stopMocking(path) {
  const calledFrom = getCallerFile();
  const fullPath = getFullPathNormalized(path, calledFrom);
  delete pendingMockExports[fullPath];
}

function stopMockingAll() {
  pendingMockExports = {};
}

function reRequire(path) {
  const module = getFullPathNormalized(path, getCallerFile());
  delete require.cache[require.resolve(module)];
  return require(module);
}

function isInNodePath(resolvedPath) {
  if (!resolvedPath) return false;

  return Module.globalPaths
    .map(nodePath => {
      return resolve(process.cwd(), nodePath) + pathsep;
    })
    .some(fullNodePath => {
      return resolvedPath.indexOf(fullNodePath) === 0;
    });
}

function getFullPath(path, calledFrom) {
  let resolvedPath;
  try {
    resolvedPath = require.resolve(path);
  } catch (e) {
    // do nothing
  }

  const isLocalModule = /^\.{1,2}[/\\]?/.test(path);
  const isInPath = isInNodePath(resolvedPath);
  const isExternal = !isLocalModule && /[/\\]node_modules[/\\]/.test(resolvedPath);
  const isSystemModule = resolvedPath === path;

  if (isExternal || isSystemModule || isInPath) {
    return resolvedPath;
  }

  if (!isLocalModule) {
    return path;
  }

  const localModuleName = join(dirname(calledFrom), path);
  try {
    return Module._resolveFilename(localModuleName);
  } catch (e) {
    if (isModuleNotFoundError(e)) {
      return localModuleName;
    } else {
      throw e;
    }
  }
}

function getFullPathNormalized(path, calledFrom) {
  return normalize(getFullPath(path, calledFrom));
}

function isModuleNotFoundError(e) {
  return e.code && e.code === 'MODULE_NOT_FOUND';
}

module.exports = startMocking;
module.exports.stop = stopMocking;
module.exports.stopAll = stopMockingAll;
module.exports.reRequire = reRequire;
