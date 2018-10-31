'use strict';

var fs = require('fs');
var path = require('path');

// Cache determined main package json as these will be referenced often
// and identification of these values is expensive.
var parsedMainPackageJson;
var mainPackageJsonPath;

exports.getMainPackageJson = function getMainPackageJson(cb) {
  if (parsedMainPackageJson !== undefined) {
    process.nextTick(function() {
      // caution: Node.js v12 and lower treat null as undefined
      // when using process.nextTick(cb, null). This leads to
      // logic differences. This needs to be kept until Node.js v12
      // and Node.js v10 support is no longer required.
      cb(null, parsedMainPackageJson);
    });
  }

  exports.getMainPackageJsonPath(function(err, packageJsonPath) {
    if (err) return cb(err);
    if (packageJsonPath == null) {
      parsedMainPackageJson = null;
      return cb(null, null);
    }

    fs.readFile(packageJsonPath, { encoding: 'utf8' }, function(readFileErr, contents) {
      if (readFileErr) return cb(readFileErr);

      // JSON parsing can fail…
      try {
        parsedMainPackageJson = JSON.parse(contents);
        // Schedule cb call in next tick to avoid calling it twice which may occur when
        // callback is throwing exceptions.
        process.nextTick(function() {
          // caution: Node.js v12 and lower treat null as undefined
          // when using process.nextTick(cb, null). This leads to
          // logic differences. This needs to be kept until Node.js v12
          // and Node.js v10 support is no longer required.
          cb(null, parsedMainPackageJson);
        });
      } catch (e) {
        cb(e, null);
      }
    });
  });
};

exports.getMainPackageJsonPath = function getMainPackageJsonPath(cb) {
  if (mainPackageJsonPath !== undefined) {
    process.nextTick(function() {
      // caution: Node.js v12 and lower treat null as undefined
      // when using process.nextTick(cb, null). This leads to
      // logic differences. This needs to be kept until Node.js v12
      // and Node.js v10 support is no longer required.
      cb(null, mainPackageJsonPath);
    });
  }

  var mainModule = process.mainModule;

  // this may happen when the Node CLI is evaluating an expression or when the REPL is used
  if (!mainModule) {
    mainPackageJsonPath = null;
    process.nextTick(function() {
      // caution: Node.js v12 and lower treat null as undefined
      // when using process.nextTick(cb, null). This leads to
      // logic differences. This needs to be kept until Node.js v12
      // and Node.js v10 support is no longer required.
      cb(null, null);
    });
    return;
  }

  var mainModuleFilename = mainModule.filename;
  searchForPackageJsonInParentDirs(path.dirname(mainModuleFilename), function(err, main) {
    if (err) return cb(err);

    mainPackageJsonPath = main;
    cb(null, mainPackageJsonPath);
  });
};

function searchForPackageJsonInParentDirs(dir, cb) {
  var fileToCheck = path.join(dir, 'package.json');

  fs.stat(fileToCheck, function(err, stats) {
    if (err) {
      if (err.code === 'ENOENT') {
        return serchInParentDir();
      }
      return cb(err);
    }

    // if it actually exists, we also need to make sure that there is a node_modules
    // directory located next to it. This way we can be relatively certain that we did
    // not encounter a component package.json (as used by the React community).
    //
    // It is highly unlikely that the application has no dependencies, because our
    // nodejs-sensor is a dependency itself
    if (stats.isFile()) {
      var potentialNodeModulesDir = path.join(dir, 'node_modules');
      fs.stat(potentialNodeModulesDir, function(statErr, dirStats) {
        if (statErr) {
          if (statErr.code === 'ENOENT') {
            return serchInParentDir();
          }
          return cb(statErr);
        }

        // great, we found a package.json which has dependencies located next to it. This
        // should be it!
        if (dirStats.isDirectory()) {
          cb(null, fileToCheck);
        } else {
          serchInParentDir();
        }
      });
    } else {
      serchInParentDir();
    }
  });

  function serchInParentDir() {
    // this happens when we cannot find a package.json
    var parentDir = path.resolve(dir, '..');
    if (dir === parentDir) return cb(null, null);

    searchForPackageJsonInParentDirs(parentDir, cb);
  }
}
