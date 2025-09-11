/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const fs = require('../uninstrumentedFs');
const path = require('path');
const isESMApp = require('./esm').isESMApp;

/** @type {import('../core').GenericLogger} */
let logger;

// Cache determined main package json as these will be referenced often
// and identification of these values is expensive.
/** @type {Object.<string, *>} */
let parsedMainPackageJson;
/** @type {string} */
let mainPackageJsonPath;
/** @type {Array.<string>} */
let nodeModulesPath;
let appInstalledIntoNodeModules = false;

/** @type {string} */
let packageJsonPath;

/**
 * @param {import('../config').InstanaConfig} config
 */
function init(config) {
  logger = config.logger;

  packageJsonPath = config.packageJsonPath;
}

function isAppInstalledIntoNodeModules() {
  return appInstalledIntoNodeModules;
}

/**
 * Looks for the app's main package.json file, parses it and returns the parsed content. The search is started at
 * path.dirname(require.main.filename).
 *
 * In case the search is successful, the result will be cached for consecutive invocations.
 *
 * @param {(err: Error, parsedMainPackageJson: Object.<string, *>) => void } cb - the callback will be called with an
 * error or the parsed package.json file as a JS object.
 */
function getMainPackageJsonStartingAtMainModule(cb) {
  // NOTE: we already cached the package.json
  if (parsedMainPackageJson !== undefined) {
    return cb(null, parsedMainPackageJson);
  }

  // CASE: customer provided custom package.json path, let's try loading it
  if (packageJsonPath) {
    return readFile(packageJsonPath, cb);
  }

  return getMainPackageJsonStartingAtDirectory(null, cb);
}

/**
 * Looks for the app's main package.json file, parses it and returns the parsed content. If the given directory is null
 * or undefined, the search will start at path.dirname(require.main.filename).
 *
 * In case the search is successful, the result will be cached for consecutive invocations.
 *
 * @param {string} startDirectory - the directory in which to start searching.
 * @param {(err: Error, parsedMainPackageJson: Object.<string, *>) => void } cb - the callback will be called with an
 * error or the parsed package.json file as a JS object.
 */
function getMainPackageJsonStartingAtDirectory(startDirectory, cb) {
  // NOTE: we already cached the package.json. We need the caching here too, because
  //       e.g. `npmPackageVersion` uses this function directly. It's duplicated code, but its acceptable.
  if (parsedMainPackageJson !== undefined) {
    return cb(null, parsedMainPackageJson);
  }

  getMainPackageJsonPathStartingAtDirectory(startDirectory, (err, foundPackageJsonPath) => {
    if (err) {
      // fs.readFile would have called cb asynchronously later, so we use process.nextTick here to make all paths async.
      return process.nextTick(cb, err, null);
    }
    if (foundPackageJsonPath == null) {
      // fs.readFile would have called cb asynchronously later, so we use process.nextTick here to make all paths async.
      return process.nextTick(cb);
    }

    readFile(foundPackageJsonPath, cb);
  });
}

/**
 *
 * @param {string} filePath
 * @param {function} cb
 */
function readFile(filePath, cb) {
  fs.readFile(filePath, { encoding: 'utf8' }, (readFileErr, contents) => {
    if (readFileErr) {
      return cb(readFileErr, null);
    }

    try {
      parsedMainPackageJson = JSON.parse(contents);
    } catch (e) {
      logger.warn(`Package.json file ${packageJsonPath} cannot be parsed: ${e?.message} ${e?.stack}`);
      return cb(e, null);
    }

    return cb(null, parsedMainPackageJson);
  });
}

/**
 * Looks for path of the app's main package.json file, starting the search at path.dirname(require.main.filename).
 *
 * In case the search is successful, the result will be cached for consecutive invocations.
 *
 * @param {(err: Error, packageJsonPath: string) => void} cb - the callback will be called with an error or the path to
 * the package.json file
 */
function getMainPackageJsonPathStartingAtMainModule(cb) {
  return getMainPackageJsonPathStartingAtDirectory(null, cb);
}

/**
 * Looks for path of the app's main package.json file, starting the search at the given directory. If the given
 * directory is null or undefined, the search will start at path.dirname(require.main.filename).
 *
 * In case the search is successful, the result will be cached for consecutive invocations.
 *
 * @param {string} startDirectory - the directory in which to start searching.
 * @param {(err: Error, packageJsonPath: string) => void} cb - the callback will be called with an error or the path to
 * the package.json file
 */
function getMainPackageJsonPathStartingAtDirectory(startDirectory, cb) {
  if (mainPackageJsonPath !== undefined) {
    // searchForPackageJsonInDirectoryTreeUpwards would have called cb asynchronously later,
    // so we use process.nextTick here to make all paths async.
    return process.nextTick(cb, null, mainPackageJsonPath);
  }

  if (!startDirectory) {
    // No explicit starting directory for searching for the main package.json has been provided, use the Node.js
    // "require.main" module as the starting point.

    // NOTE: "require.main" is undefined when the Instana collector is required inside a
    // preloaded module using "--require". "process.mainModule" is not, but it is deprecated and should
    // no longer been used.
    let mainModule = require.main;

    if (!mainModule) {
      // This happens
      // a) when the Node CLI is evaluating an expression, or
      // b) when the REPL is used
      // c) when we have been pre-required with the --require/-r command line flag.
      // d) when --experimental-loader is used for ESM apps.
      //
      // In particular for case (c) we can try again later and wait for the main module to be loaded.
      // But usually that is not necessary because the initialisation of the collector takes longer than
      // Node.js having not loaded the main module. Still, it is "ok" to keep the retry mechanismn inside
      // the individual metrics (e.g. name.js) just for safety.
      //
      // But when the application is using ES modules and they require the Instana collector
      // with "--require file.cjs", neither `require.main` nor the deprecated `process.mainModule`
      // will have a value, because ES modules use `import.meta` and soon `import.main`.
      // See https://github.com/nodejs/modules/issues/274

      // eslint-disable-next-line max-len
      // See https://github.com/nodejs/node/blob/472edc775d683aed2d9ed39ca7cf381f3e7e3ce2/lib/internal/modules/run_main.js#L79
      // Node.js is using `process.argv[1]` internally as main file path.
      // Check whether a module was preloaded and use process.argv[1] as filename.
      if (
        // @ts-ignore
        (process._preload_modules && process._preload_modules.length > 0) ||
        isESMApp()
      ) {
        // @ts-ignore
        mainModule = {
          filename: process.argv[1]
        };
      } else {
        return process.nextTick(cb);
      }
    }

    startDirectory = path.dirname(mainModule.filename);
  }

  searchForPackageJsonInDirectoryTreeUpwards(startDirectory, (err, main) => {
    if (err) {
      return cb(err, null);
    }

    mainPackageJsonPath = main;
    return cb(null, mainPackageJsonPath);
  });
}

/**
 * @param {string} dir
 * @param {(err: Error, main: *) => void} cb
 */
function searchForPackageJsonInDirectoryTreeUpwards(dir, cb) {
  const pathToCheck = path.join(dir, 'package.json');

  fs.stat(pathToCheck, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return searchInParentDir(dir, searchForPackageJsonInDirectoryTreeUpwards, cb);
      } else {
        // searchInParentDir would have called cb asynchronously,
        // so we use process.nextTick here to make all paths async.
        return process.nextTick(cb, err, null);
      }
    }

    appInstalledIntoNodeModules = dir.indexOf('node_modules') >= 0;
    if (appInstalledIntoNodeModules) {
      // Some users do not deploy their app by cloning/copying the app's sources to the target system and installing its
      // dependencies via npm/yarn there. Instead, they publish the whole app into an npm-compatible registry and use
      // npm install $appName on the target system to deploy the app including its dependencies. In this scenario, we
      // need to skip the check for an accompanying node_modules folder (see below). We can recognize this pattern
      // (heuristically) by the fact that the segment 'node_modules' already appears in the path to the main module.
      return process.nextTick(cb, null, pathToCheck);
    }

    // If the package.json file actually exists, we also need to make sure that there is a node_modules directory
    // located next to it. This way we can be relatively certain that we did not encounter a component package.json
    // (as used by React for example). It is highly unlikely that the application has no dependencies, because
    // @instana/core is a dependency itself.
    if (stats.isFile()) {
      const potentialNodeModulesDir = path.join(dir, 'node_modules');
      fs.stat(potentialNodeModulesDir, (statErr, potentialNodeModulesDirStats) => {
        if (statErr) {
          if (statErr.code === 'ENOENT') {
            return searchInParentDir(dir, searchForPackageJsonInDirectoryTreeUpwards, cb);
          }
          // searchInParentDir would have called cb asynchronously,
          // so we use process.nextTick here to make all paths async.
          return process.nextTick(cb, statErr, null);
        }

        if (potentialNodeModulesDirStats.isDirectory()) {
          // We have found a package.json which has dependencies located next to it. We assume that this is the
          // package.json file we are looking for.

          // Also, searchInParentDir would have called cb asynchronously,
          // so we use process.nextTick here to make all paths async.
          return process.nextTick(cb, null, pathToCheck);
        } else {
          return searchInParentDir(dir, searchForPackageJsonInDirectoryTreeUpwards, cb);
        }
      });
    } else {
      return searchInParentDir(dir, searchForPackageJsonInDirectoryTreeUpwards, cb);
    }
  });
}

/**
 * @param {(errNodeModules: *, nodeModulesFolder: *) => *} cb
 */
function findNodeModulesFolder(cb) {
  if (nodeModulesPath !== undefined) {
    return process.nextTick(cb, null, nodeModulesPath);
  }

  const mainModule = require.main;
  if (!mainModule) {
    return process.nextTick(cb);
  }
  const startDirectory = path.dirname(mainModule.filename);

  searchForNodeModulesInDirectoryTreeUpwards(startDirectory, (err, nodeModulesPath_) => {
    if (err) {
      return cb(err, null);
    }

    nodeModulesPath = nodeModulesPath_;
    return cb(null, nodeModulesPath);
  });
}

/**
 * @param {string} dir
 * @param {(err: Error, nodeModulesPath: *) => void} cb
 */
function searchForNodeModulesInDirectoryTreeUpwards(dir, cb) {
  const pathToCheck = path.join(dir, 'node_modules');

  fs.stat(pathToCheck, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return searchInParentDir(dir, searchForNodeModulesInDirectoryTreeUpwards, cb);
      } else {
        // searchInParentDir would have called cb asynchronously,
        // so we use process.nextTick here to make all paths async.
        return process.nextTick(cb, err, null);
      }
    }

    if (stats.isDirectory()) {
      return process.nextTick(cb, null, pathToCheck);
    } else {
      return searchInParentDir(dir, searchForNodeModulesInDirectoryTreeUpwards, cb);
    }
  });
}

/**
 * @param {string} dir
 * @param {(parentDir: string, cb: Function) => void} onParentDir
 * @param {Function} cb
 */
function searchInParentDir(dir, onParentDir, cb) {
  const parentDir = path.resolve(dir, '..');
  if (dir === parentDir) {
    // We have arrived at the root of the file system hierarchy.
    //
    // searchForPackageJsonInDirectoryTreeUpwards would have called cb asynchronously,
    // so we use process.nextTick here to make all paths async.
    return process.nextTick(cb, null, null);
  }

  return onParentDir(parentDir, cb);
}

const reset = () => {
  parsedMainPackageJson = undefined;
  mainPackageJsonPath = undefined;
};

module.exports = {
  init,
  isAppInstalledIntoNodeModules,
  getMainPackageJsonStartingAtMainModule,
  getMainPackageJsonStartingAtDirectory,
  getMainPackageJsonPathStartingAtMainModule,
  getMainPackageJsonPathStartingAtDirectory,
  findNodeModulesFolder,
  reset
};
