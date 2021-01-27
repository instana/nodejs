/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const fs = require('fs');

const applicationUnderMonitoring = require('@instana/core').util.applicationUnderMonitoring;

let logger = require('@instana/core').logger.getLogger('metrics');
exports.setLogger = function setLogger(_logger) {
  logger = _logger;
};

exports.payloadPrefix = 'directDependencies';
exports.currentPayload = {
  dependencies: {},
  peerDependencies: {},
  optionalDependencies: {}
};

const MAX_ATTEMPTS = 20;
const DELAY = 1000;
let attempts = 0;

exports.activate = function activate() {
  attempts++;
  applicationUnderMonitoring.getMainPackageJsonPath((err, packageJsonPath) => {
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
  fs.readFile(packageJsonPath, { encoding: 'utf8' }, (err, contents) => {
    if (err) {
      return logger.debug('Failed to analyze direct dependencies dependency due to: %s.', err.message);
    }

    try {
      const pckg = JSON.parse(contents);
      exports.currentPayload.dependencies = pckg.dependencies || {};
      exports.currentPayload.peerDependencies = pckg.peerDependencies || {};
      exports.currentPayload.optionalDependencies = pckg.optionalDependencies || {};
      exports.currentPayload[pckg.name] = pckg.version;
    } catch (subErr) {
      return logger.debug('Failed to parse package.json %s dependency due to: %s', packageJsonPath, subErr.message);
    }
  });
}
