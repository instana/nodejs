'use strict';

var path = require('path');
var fs = require('fs');

var applicationUnderMonitoring = require('@instana/core').util.applicationUnderMonitoring;
var logger;
logger = require('../logger').getLogger('metrics/dependencies', function(newLogger) {
  logger = newLogger;
});

exports.payloadPrefix = 'dependencies';
exports.currentPayload = {};

exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJsonPath(function(err, packageJsonPath) {
    if (err) {
      return logger.warn('Failed to determine main package.json. Reason: %s %s ', err.message, err.stack);
    } else if (!packageJsonPath) {
      return logger.warn('Main package.json could not be found. Stopping dependency analysis.');
    }

    addDependenciesFromDir(path.join(path.dirname(packageJsonPath), 'node_modules'));
  });
};

function addDependenciesFromDir(dependencyDir) {
  fs.readdir(dependencyDir, function(readDirErr, dependencies) {
    if (readDirErr) {
      return logger.warn('Cannot analyse dependencies due to %s', readDirErr.message);
    }

    dependencies
      .filter(function(dependency) {
        // exclude the .bin directory
        return dependency !== '.bin';
      })
      .forEach(function(dependency) {
        if (dependency.indexOf('@') === 0) {
          addDependenciesFromDir(path.join(dependencyDir, dependency));
        } else {
          var fullDirPath = path.join(dependencyDir, dependency);
          // Only check directories. For example, yarn adds a .yarn-integrity file to /node_modules/ which we need to
          // exclude, otherwise we get a confusing "Failed to identify version of .yarn-integrity dependency due to:
          // ENOTDIR: not a directory, open '.../node_modules/.yarn-integrity/package.json'." in the logs.
          fs.stat(fullDirPath, function(statErr, stats) {
            if (statErr) {
              return logger.warn('Cannot analyse dependency %s due to %s', fullDirPath, statErr.message);
            }
            if (stats.isDirectory()) {
              var fullPackageJsonPath = path.join(fullDirPath, 'package.json');
              addDependency(dependency, fullPackageJsonPath);
            }
          });
        }
      });
  });
}

function addDependency(dependency, packageJsonPath) {
  fs.readFile(packageJsonPath, { encoding: 'utf8' }, function(err, contents) {
    if (err && err.code === 'ENOENT') {
      // This directory does not contain a package json. This happens for example for node_modules/.cache etc.
      // We can simply ignore this.
      return logger.debug('No package.json at ' + packageJsonPath + ', ignoring this directory.');
    } else if (err) {
      return logger.info(
        'Failed to identify version of %s dependency due to: %s. This means that you will not be ' +
          'able to see details about this dependency within Instana.',
        dependency,
        err.message
      );
    }

    try {
      var pckg = JSON.parse(contents);
      exports.currentPayload[pckg.name] = pckg.version;
    } catch (subErr) {
      return logger.info(
        'Failed to identify version of %s dependency due to: %s. This means that you will not be ' +
          'able to see details about this dependency within Instana.',
        dependency,
        subErr.message
      );
    }
  });
}
