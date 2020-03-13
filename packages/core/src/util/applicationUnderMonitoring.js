'use strict';

var fs = require('fs');
var path = require('path');

// Cache determined main package json as these will be referenced often
// and identification of these values is expensive.
var parsedMainPackageJson;
var mainPackageJsonPath;
var appInstalledIntoNodeModules = false;

exports.isAppInstalledIntoNodeModules = function isAppInstalledIntoNodeModules() {
  return appInstalledIntoNodeModules;
};

exports.getMainPackageJson = function getMainPackageJson(startDirectory, cb) {
  if (typeof startDirectory === 'function') {
    cb = startDirectory;
    startDirectory = null;
  }

  if (parsedMainPackageJson !== undefined) {
    return process.nextTick(cb, null, parsedMainPackageJson);
  }

  exports.getMainPackageJsonPath(startDirectory, function(err, packageJsonPath) {
    if (err) {
      // fs.readFile would have called cb asynchronously later, so we use process.nextTick here to make all paths async.
      return process.nextTick(cb, err, null);
    }
    if (packageJsonPath == null) {
      // fs.readFile would have called cb asynchronously later, so we use process.nextTick here to make all paths async.
      return process.nextTick(cb);
    }

    fs.readFile(packageJsonPath, { encoding: 'utf8' }, function(readFileErr, contents) {
      if (readFileErr) {
        return cb(readFileErr, null);
      }

      try {
        parsedMainPackageJson = JSON.parse(contents);
      } catch (e) {
        return cb(e, null);
      }
      return cb(null, parsedMainPackageJson);
    });
  });
};

exports.getMainPackageJsonPath = function getMainPackageJsonPath(startDirectory, cb) {
  if (typeof startDirectory === 'function') {
    cb = startDirectory;
    startDirectory = null;
  }

  if (mainPackageJsonPath !== undefined) {
    // searchForPackageJsonInDirectoryTreeUpwards would have called cb asynchronously later,
    // so we use process.nextTick here to make all paths async.
    return process.nextTick(cb, null, mainPackageJsonPath);
  }

  if (!startDirectory) {
    // No explicit starting directory for searching for the main package.json has been provided, use the Node.js
    // process' main module as the starting point.
    var mainModule = process.mainModule;

    if (!mainModule) {
      // This happens
      // a) when the Node CLI is evaluating an expression, or
      // b) when the REPL is used, or
      // c) when we have been pre-required with the --require/-r command line flag
      // In particular for case (c) we want to try again later. This is handled in the individual metrics that rely on
      // evaluating the package.json file.
      return process.nextTick(cb);
    }
    startDirectory = path.dirname(mainModule.filename);
  }

  searchForPackageJsonInDirectoryTreeUpwards(startDirectory, function(err, main) {
    if (err) {
      return cb(err, null);
    }

    mainPackageJsonPath = main;
    return cb(null, mainPackageJsonPath);
  });
};

function searchForPackageJsonInDirectoryTreeUpwards(dir, cb) {
  var fileToCheck = path.join(dir, 'package.json');

  fs.stat(fileToCheck, function(err, stats) {
    if (err) {
      if (err.code === 'ENOENT') {
        return searchInParentDir();
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
      return process.nextTick(cb, null, fileToCheck);
    }

    // If the package.json file actually exists, we also need to make sure that there is a node_modules directory
    // located next to it. This way we can be relatively certain that we did not encounter a component package.json
    // (as used by React for example). It is highly unlikely that the application has no dependencies, because
    // @instana/core is a dependency itself.
    if (stats.isFile()) {
      var potentialNodeModulesDir = path.join(dir, 'node_modules');
      fs.stat(potentialNodeModulesDir, function(statErr, potentialNodeModulesDirStats) {
        if (statErr) {
          if (statErr.code === 'ENOENT') {
            return searchInParentDir();
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
          return process.nextTick(cb, null, fileToCheck);
        } else {
          return searchInParentDir();
        }
      });
    } else {
      return searchInParentDir();
    }
  });

  function searchInParentDir() {
    // this happens when we cannot find a package.json
    var parentDir = path.resolve(dir, '..');
    if (dir === parentDir) {
      // searchForPackageJsonInDirectoryTreeUpwards would have called cb asynchronously,
      // so we use process.nextTick here to make all paths async.
      return process.nextTick(cb, null, null);
    }

    return searchForPackageJsonInDirectoryTreeUpwards(parentDir, cb);
  }
}
