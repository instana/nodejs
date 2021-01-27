/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const path = require('path');
const fs = require('fs');

const applicationUnderMonitoring = require('@instana/core').util.applicationUnderMonitoring;

let logger = require('@instana/core').logger.getLogger('metrics');
exports.setLogger = function setLogger(_logger) {
  logger = _logger;
};

exports.payloadPrefix = 'dependencies';
exports.currentPayload = {};

const MAX_ATTEMPTS = 20;
const DELAY = 1000;
let attempts = 0;

exports.activate = function activate() {
  attempts++;
  applicationUnderMonitoring.getMainPackageJsonPath((err, packageJsonPath) => {
    if (err) {
      return logger.warn('Failed to determine main package.json. Reason: %s %s ', err.message, err.stack);
    } else if (!packageJsonPath && attempts < MAX_ATTEMPTS) {
      logger.debug('Main package.json could not be found. Will try again later.');
      setTimeout(exports.activate, DELAY).unref();
      return;
    } else if (!packageJsonPath) {
      logger.info(
        `Main package.json could not be found after ${attempts} retries. Looking for node_modules folder now.`
      );
      applicationUnderMonitoring.findNodeModulesFolder((errNodeModules, nodeModulesFolder) => {
        if (errNodeModules) {
          return logger.warn('Failed to determine node_modules folder. Reason: %s %s ', err.message, err.stack);
        } else if (!nodeModulesFolder) {
          return logger.warn(
            'Neither the package.json file nor the node_modules folder could be found. Stopping dependency analysis.'
          );
        }
        addDependenciesFromDir(path.join(nodeModulesFolder));
      });
      return;
    }

    let dependencyDir;
    if (applicationUnderMonitoring.isAppInstalledIntoNodeModules()) {
      dependencyDir = path.join(path.dirname(packageJsonPath), '..', '..', 'node_modules');
    } else {
      dependencyDir = path.join(path.dirname(packageJsonPath), 'node_modules');
    }
    addDependenciesFromDir(dependencyDir);
  });
};

function addDependenciesFromDir(dependencyDir) {
  fs.readdir(dependencyDir, (readDirErr, dependencies) => {
    if (readDirErr) {
      return logger.warn('Cannot analyse dependencies due to %s', readDirErr.message);
    }

    dependencies
      .filter(
        (
          dependency // exclude the .bin directory
        ) => dependency !== '.bin'
      )
      .forEach(dependency => {
        if (dependency.indexOf('@') === 0) {
          addDependenciesFromDir(path.join(dependencyDir, dependency));
        } else {
          const fullDirPath = path.join(dependencyDir, dependency);
          // Only check directories. For example, yarn adds a .yarn-integrity file to /node_modules/ which we need to
          // exclude, otherwise we get a confusing "Failed to identify version of .yarn-integrity dependency due to:
          // ENOTDIR: not a directory, open '.../node_modules/.yarn-integrity/package.json'." in the logs.
          fs.stat(fullDirPath, (statErr, stats) => {
            if (statErr) {
              return logger.warn('Cannot analyse dependency %s due to %s', fullDirPath, statErr.message);
            }
            if (stats.isDirectory()) {
              const fullPackageJsonPath = path.join(fullDirPath, 'package.json');
              addDependency(dependency, fullPackageJsonPath);
            }
          });
        }
      });
  });
}

function addDependency(dependency, packageJsonPath) {
  fs.readFile(packageJsonPath, { encoding: 'utf8' }, (err, contents) => {
    if (err && err.code === 'ENOENT') {
      // This directory does not contain a package json. This happens for example for node_modules/.cache etc.
      // We can simply ignore this.
      return logger.debug(`No package.json at ${packageJsonPath}, ignoring this directory.`);
    } else if (err) {
      return logger.info(
        'Failed to identify version of %s dependency due to: %s. This means that you will not be ' +
          'able to see details about this dependency within Instana.',
        dependency,
        err.message
      );
    }

    try {
      const pckg = JSON.parse(contents);
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
