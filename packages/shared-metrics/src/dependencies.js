/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { applicationUnderMonitoring } = require('@instana/core').util;

let logger = require('@instana/core').logger.getLogger('metrics');

const CountDownLatch = require('./util/CountDownLatch');
const { DependencyDistanceCalculator, MAX_DEPTH } = require('./util/DependencyDistanceCalculator');

/**
 * @param {import('@instana/core/src/logger').GenericLogger} _logger
 */
exports.setLogger = function setLogger(_logger) {
  logger = _logger;
};

/** @type {number} */
exports.MAX_DEPENDENCIES = 750;

/** @type {string} */
exports.payloadPrefix = 'dependencies';

/** @type {Object.<string, *>} */
const preliminaryPayload = {};

/** @type {Object.<string, *>} */
// @ts-ignore: Cannot redeclare exported variable 'currentPayload'
exports.currentPayload = {};

exports.MAX_ATTEMPTS = 20;

const DELAY = 1000;
let attempts = 0;

exports.activate = function activate() {
  attempts++;

  const started = Date.now();
  applicationUnderMonitoring.getMainPackageJsonPathStartingAtMainModule((err, mainPackageJsonPath) => {
    if (err) {
      return logger.warn('Failed to determine main package.json. Reason: %s %s ', err.message, err.stack);
    } else if (!mainPackageJsonPath && attempts < exports.MAX_ATTEMPTS) {
      logger.debug('Main package.json could not be found. Will try again later.');
      setTimeout(exports.activate, DELAY).unref();
      return;
    } else if (!mainPackageJsonPath) {
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

        addAllDependencies(path.join(nodeModulesFolder), started, null);
      });
      return;
    }

    let dependencyDir;
    if (applicationUnderMonitoring.isAppInstalledIntoNodeModules()) {
      dependencyDir = path.join(path.dirname(mainPackageJsonPath), '..', '..', 'node_modules');
    } else {
      dependencyDir = path.join(path.dirname(mainPackageJsonPath), 'node_modules');
    }
    addAllDependencies(dependencyDir, started, mainPackageJsonPath);
  });
};

/**
 * Finds all installed modules in the given dependencyDir (say, /path/to/app/node_modules) and saves the dependency with
 * the associated version into preliminaryPayload.
 *
 * @param {string} dependencyDir
 * @param {number} started
 * @param {string} packageJsonPath
 */
function addAllDependencies(dependencyDir, started, packageJsonPath) {
  addDependenciesFromDir(dependencyDir, () => {
    if (Object.keys(preliminaryPayload).length <= exports.MAX_DEPENDENCIES) {
      // @ts-ignore: Cannot redeclare exported variable 'currentPayload'
      exports.currentPayload = preliminaryPayload;
      logger.debug(`Collection of dependencies took ${Date.now() - started} ms.`);
      return;
    }

    if (packageJsonPath) {
      new DependencyDistanceCalculator().calculateDistancesFrom(packageJsonPath, distancesFromRoot => {
        logger.debug(`Collection of dependencies took ${Date.now() - started} ms.`);
        limitAndSet(distancesFromRoot);
      });
    } else {
      logger.debug(`Collection of dependencies took ${Date.now() - started} ms.`);
      limitAndSet();
    }
  });
}

/**
 * Finds all installed modules in dependencyDir (say, /path/to/app/node_modules) and saves the dependency with the
 * associated version into preliminaryPayload.
 *
 * @param {string} dependencyDir
 * @param {() => void} callback
 */
function addDependenciesFromDir(dependencyDir, callback) {
  fs.readdir(dependencyDir, (readDirErr, dependencies) => {
    if (readDirErr || !dependencies) {
      logger.warn('Cannot analyse dependencies due to %s', readDirErr.message);
      callback();
      return;
    }

    const filteredDependendencies = dependencies.filter(
      (
        dependency // exclude the .bin directory
      ) => dependency !== '.bin'
    );
    if (filteredDependendencies.length === 0) {
      callback();
      return;
    }

    // This latch fires once all dependencies of the current directory in the node_modules tree have been analysed.
    const countDownLatch = new CountDownLatch(filteredDependendencies.length);
    countDownLatch.once('done', () => {
      callback();
    });

    filteredDependendencies.forEach(dependency => {
      if (dependency.indexOf('@') === 0) {
        addDependenciesFromDir(path.join(dependencyDir, dependency), () => {
          countDownLatch.countDown();
        });
      } else {
        const fullDirPath = path.join(dependencyDir, dependency);
        // Only check directories. For example, yarn adds a .yarn-integrity file to /node_modules/ which we need to
        // exclude, otherwise we get a confusing "Failed to identify version of .yarn-integrity dependency due to:
        // ENOTDIR: not a directory, open '.../node_modules/.yarn-integrity/package.json'." in the logs.
        fs.stat(fullDirPath, (statErr, stats) => {
          if (statErr) {
            countDownLatch.countDown();
            logger.warn('Cannot analyse dependency %s due to %s', fullDirPath, statErr.message);
            return;
          }
          if (!stats.isDirectory()) {
            countDownLatch.countDown();
            return;
          }

          addDependency(dependency, fullDirPath, countDownLatch);
        });
      }
    });
  });
}

/**
 * Parses the package.json file in the given directory and then adds the given dependency (with its version) to
 * preliminaryPayload.
 *
 * @param {string} dependency
 * @param {string} dependencyDirPath
 * @param {import('./util/CountDownLatch')} countDownLatch
 */
function addDependency(dependency, dependencyDirPath, countDownLatch) {
  const packageJsonPath = path.join(dependencyDirPath, 'package.json');
  fs.readFile(packageJsonPath, { encoding: 'utf8' }, (err, contents) => {
    if (err && err.code === 'ENOENT') {
      // This directory does not contain a package json. This happens for example for node_modules/.cache etc.
      // We can simply ignore this.
      countDownLatch.countDown();
      logger.debug(`No package.json at ${packageJsonPath}, ignoring this directory.`);
      return;
    } else if (err) {
      countDownLatch.countDown();
      logger.info(
        'Failed to identify version of %s dependency due to: %s. This means that you will not be ' +
          'able to see details about this dependency within Instana.',
        dependency,
        err.message
      );
      return;
    }

    try {
      const parsedPackageJson = JSON.parse(contents);
      if (!preliminaryPayload[parsedPackageJson.name]) {
        preliminaryPayload[parsedPackageJson.name] = parsedPackageJson.version;
      }
    } catch (parseErr) {
      return logger.info(
        'Failed to identify version of %s dependency due to: %s. This means that you will not be ' +
          'able to see details about this dependency within Instana.',
        dependency,
        parseErr.message
      );
    }

    const potentialNestedNodeModulesFolder = path.join(dependencyDirPath, 'node_modules');
    fs.stat(potentialNestedNodeModulesFolder, (statErr, stats) => {
      if (statErr || !stats.isDirectory()) {
        countDownLatch.countDown();
        return;
      }
      addDependenciesFromDir(potentialNestedNodeModulesFolder, () => {
        countDownLatch.countDown();
      });
    });
  });
}

/**
 * Limits the collected dependencies to exports.MAX_DEPENDENCIES entries and commits them to exports.currentPayload.
 *
 * @param {Object<string, any>} distances
 */
function limitAndSet(distances = {}) {
  const keys = Object.keys(preliminaryPayload);
  keys.sort(sortByDistance.bind(null, distances));

  // After sorting, the most distant (and therefore, most uninteresting) packages are a the start of the array. For
  // packages with the same distance, we sort in a reverse lexicographic order. That means, that if no distances are
  // available at all, packages will be in reverse lexicographical order.
  //
  // At any rate, we start deleting collected depenencies from the payload at index 0, that is, we either remove the
  // most distant ones or the ones that are at the end of the lexicographic order.
  for (let i = 0; i < keys.length - exports.MAX_DEPENDENCIES; i++) {
    delete preliminaryPayload[keys[i]];
  }

  // @ts-ignore: Cannot redeclare exported variable 'currentPayload'
  exports.currentPayload = preliminaryPayload;
}

/**
 * Compares the given dependencies by their distance.
 *
 * @param {Object<string, any>} distances
 * @param {string} dependency1
 * @param {string} dependency2
 */
function sortByDistance(distances, dependency1, dependency2) {
  // To make troubleshooting easier, we always want to include the Instana dependencies, therefore they will be sorted
  // to the end of the array.
  const isInstana1 = dependency1.indexOf('instana') >= 0;
  const isInstana2 = dependency2.indexOf('instana') >= 0;
  if (isInstana1 && isInstana2) {
    return dependency2.localeCompare(dependency1);
  } else if (isInstana1) {
    return 1;
  } else if (isInstana2) {
    return -1;
  }

  const d1 = distances[dependency1] || MAX_DEPTH + 1;
  const d2 = distances[dependency2] || MAX_DEPTH + 1;
  if (d1 === d2) {
    // for the same distance, sort lexicographically
    return dependency2.localeCompare(dependency1);
  }
  return d2 - d1;
}
