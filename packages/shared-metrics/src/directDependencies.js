'use strict';

var fs = require('fs');

var applicationUnderMonitoring = require('@instana/core').util.applicationUnderMonitoring;

var logger = require('@instana/core').logger.getLogger('metrics');
exports.setLogger = function(_logger) {
  logger = _logger;
};

exports.payloadPrefix = 'directDependencies';
exports.currentPayload = {
  dependencies: {},
  peerDependencies: {},
  optionalDependencies: {}
};

var MAX_ATTEMPTS = 20;
var DELAY = 1000;
var attempts = 0;

exports.activate = function() {
  attempts++;
  applicationUnderMonitoring.getMainPackageJsonPath(function(err, packageJsonPath) {
    if (err) {
      return logger.info(
        'Failed to determine main package.json for analysis of direct dependencies. Reason: %s %s ',
        err.message,
        err.stack
      );
    } else if (!packageJsonPath && attempts < MAX_ATTEMPTS) {
      setTimeout(exports.activate, DELAY).unref();
      return;
    } else if (!packageJsonPath) {
      // final attempt failed, ignore silently
      return;
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
