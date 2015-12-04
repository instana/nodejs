'use strict';

var debug = require('debug')('instana-nodejs-sensor:dependencies');
var fs = require('fs');
var path = require('path');
var applicationUnderMonitoring = require('../applicationUnderMonitoring');

exports.payloadType = 'app';
exports.payloadPrefix = 'dependencies';
exports.currentPayload = {};


exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJsonPath(function(err, packageJsonPath) {
    if (err) {
      return debug('Failed to determine main package json. Reason: ' + err.message, err.stack);
    } else if (!packageJsonPath) {
      return debug('main package json could not be found. Stopping dependency analysis.');
    }

    var rootPath = path.dirname(packageJsonPath);
    var dependenciesPath = path.join(rootPath, 'node_modules');

    fs.readdir(dependenciesPath, function(readDirErr, dependencies) {
      if (readDirErr) {
        return debug('Cannot analyse dependencies due to ' + readDirErr.message);
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
      return debug('Failed to identify version of %s dependency due to', dependency, err);
    }

    try {
      var pckg = JSON.parse(contents);
      exports.currentPayload[pckg.name] = pckg.version;
    } catch (subErr) {
      return debug('Failed to identify version of %s dependency due to', dependency, subErr);
    }
  });
}


exports.deactivate = function() {};
