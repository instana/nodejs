'use strict';

var path = require('path');
var fs = require('fs');

var applicationUnderMonitoring = require('../applicationUnderMonitoring');
var logger = require('../logger').getLogger('dependencies');

exports.payloadType = 'app';
exports.payloadPrefix = 'dependencies';
exports.currentPayload = {};


exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJsonPath(function(err, packageJsonPath) {
    if (err) {
      return logger.warn('Failed to determine main package json. Reason: %s %s ', err.message, err.stack);
    } else if (!packageJsonPath) {
      return logger.warn('main package json could not be found. Stopping dependency analysis.');
    }

    var rootPath = path.dirname(packageJsonPath);
    var dependenciesPath = path.join(rootPath, 'node_modules');

    fs.readdir(dependenciesPath, function(readDirErr, dependencies) {
      if (readDirErr) {
        return logger.warn('Cannot analyse dependencies due to %s', readDirErr.message);
      }

      dependencies.filter(function(dependency) {
          // exclude the .bin directory
          return dependency !== '.bin';
        })
        .forEach(function(dependency) {
          var fullPackageJsonPath = path.join(dependenciesPath, dependency, 'package.json');
          addDependency(dependency, fullPackageJsonPath);
        });
    });
  });
};


function addDependency(dependency, packageJsonPath) {
  fs.readFile(packageJsonPath, {encoding: 'utf8'}, function(err, contents) {
    if (err) {
      return logger.warn('Failed to identify version of %s dependency due to', dependency, err);
    }

    try {
      var pckg = JSON.parse(contents);
      exports.currentPayload[pckg.name] = pckg.version;
    } catch (subErr) {
      return logger.warn('Failed to identify version of %s dependency due to', dependency, subErr);
    }
  });
}


exports.deactivate = function() {};
