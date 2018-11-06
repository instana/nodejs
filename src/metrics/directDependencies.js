'use strict';

var fs = require('fs');

var applicationUnderMonitoring = require('../applicationUnderMonitoring');
var logger = require('../logger').getLogger('dependencies');

exports.payloadPrefix = 'directDependencies';
exports.currentPayload = {
  dependencies: {},
  peerDependencies: {},
  optionalDependencies: {}
};

exports.activate = function() {
  applicationUnderMonitoring.getMainPackageJsonPath(function(err, packageJsonPath) {
    if (err) {
      return logger.info(
        'Failed to determine main package.json for analysis of direct dependencies. Reason: %s %s ',
        err.message,
        err.stack
      );
    } else if (!packageJsonPath) {
      return logger.info('Main package.json could not be found. Stopping analysis of direct dependencies.');
    }
    addDirectDependenciesFromMainPackageJson(packageJsonPath);
  });
};

function addDirectDependenciesFromMainPackageJson(packageJsonPath) {
  fs.readFile(packageJsonPath, { encoding: 'utf8' }, function(err, contents) {
    if (err) {
      return logger.debug('Failed to analyze direct dependencies dependency due to: %s.', err.message);
    }

    try {
      var pckg = JSON.parse(contents);
      exports.currentPayload.dependencies = pckg.dependencies || {};
      exports.currentPayload.peerDependencies = pckg.peerDependencies || {};
      exports.currentPayload.optionalDependencies = pckg.optionalDependencies || {};
      exports.currentPayload[pckg.name] = pckg.version;
    } catch (subErr) {
      return logger.debug('Failed to parse package.json %s dependency due to: %s', packageJsonPath, subErr.message);
    }
  });
}

exports.deactivate = function() {};
