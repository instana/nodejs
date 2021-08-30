/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CountDownLatch = require('./CountDownLatch');

let logger = require('@instana/core').logger.getLogger('metrics');

/**
 * @param {import('@instana/core/src/logger').GenericLogger} _logger
 */
exports.setLogger = function setLogger(_logger) {
  logger = _logger;
};

class DependencyDistanceCalculator {
  /**
   * Calculates the distance for all dependencies, starting at the given package.json file. Direct dependencies listed
   * in the passed package.json have distance 1. Dependencies of those dependencies have distance 2, and so on. This is
   * calculated by parsing package.json files recursively, traversing the tree of dependencies.
   *
   * @param {string} packageJsonPath the path to the package.json file to examine initially
   * @param {(distances: Object<string, any>) => void} callback
   */
  calculateDistancesFrom(packageJsonPath, callback) {
    this.started = Date.now();
    assert.strictEqual(typeof packageJsonPath, 'string');
    assert.strictEqual(typeof callback, 'function');
    /** @type {Object.<string, any>} */
    this.distancesFromRoot = {};

    this.globalCountDownLatchAllPackages = new CountDownLatch(0);
    this.globalCountDownLatchAllPackages.once('done', () => {
      logger.debug(`Calculation of dependency distances took ${Date.now() - this.started} ms.`);
      callback(this.distancesFromRoot);
    });
    this._calculateDistances(packageJsonPath, 1);
  }

  /**
   * Calculates the distances for the dependencies in the given package.json file. Direct dependencies of the
   * application have distance 1. Dependencies of those dependencies have distance 2, and so on. This is calculated by
   * parsing package.json files recursively, traversing the tree of dependencies.
   *
   * @param {string} packageJsonPath The path to the package.json file to examine
   * @param {number} distance The distance from the application along the tree of dependencies
   */
  _calculateDistances(packageJsonPath, distance) {
    if (distance > module.exports.MAX_DEPTH) {
      // Do not descend deeper than maxDepth nesting levels.
      return;
    }
    if (typeof packageJsonPath !== 'string') {
      return;
    }

    // For each package.json that we find in the dependency tree, we initially increase the global count down latch
    // by 3, that is, one for each type of dependencies (normal, optional, peer). Once we have in turn queued all
    // dependencies found in this package.json for a particular dependency type, we decrement the global count down
    // latch by one. When this has happend for all three types of dependencies, the net change for the global latch will
    // be zero, but sub dependencies will already have been incremented the global count down latch.
    this.globalCountDownLatchAllPackages.countUp(3);

    // Read the associated package.json and parse it.
    try {
      fs.readFile(packageJsonPath, { encoding: 'utf8' }, (err, contents) => {
        if (err) {
          logger.debug(
            'Failed to calculate transitive distances for some dependencies, could not read package.json file at ' +
              '%s: %s.',
            packageJsonPath,
            err.message
          );

          // If we cannot parse the package.json or if it does not exist, we need to decrement by 3 immediately because
          // we increment the latch by 3 for each node (see above).
          this.globalCountDownLatchAllPackages.countDown(3);
          return;
        }

        let parsedPackageJson;
        try {
          parsedPackageJson = JSON.parse(contents);
        } catch (parseErr) {
          logger.debug(
            'Failed to calculate transitive distances for some dependencies, could not parse package.json file at ' +
              '%s: %s',
            packageJsonPath,
            parseErr.message
          );
          this.globalCountDownLatchAllPackages.countDown(3);
          return;
        }

        // Each call to _calculateDistancesForOneType is guaranteed to decrease the global count down latch by exactly
        // one, to offset the increment of 3 that we did for this node in the dependency tree initially.
        this._calculateDistancesForOneType(parsedPackageJson.dependencies, distance);
        this._calculateDistancesForOneType(parsedPackageJson.peerDependencies, distance);
        this._calculateDistancesForOneType(parsedPackageJson.optionalDependencies, distance);
      });
    } catch (fsReadFileErr) {
      // This catch-block is for synchronous errors from fs.readFile, which can also happen in addition to the callback
      // being called with an error.
      logger.debug(
        'Failed to calculate transitive distances for some dependencies, synchronous error from fs.readFile for %s:',
        packageJsonPath,
        fsReadFileErr
      );
      this.globalCountDownLatchAllPackages.countDown(3);
    }
  }

  /**
   * Iterates over the given set of dependencies to calculate their distances. The set of dependencies will what is
   * defined in a package.json file for one particular type of dependencys (normal, optional, or peer).
   *
   * @param {Array<string>} dependencies The dependencies to analyze
   * @param {number} distance How far the dependencies are from the root package
   */
  _calculateDistancesForOneType(dependencies, distance) {
    if (!dependencies) {
      this.globalCountDownLatchAllPackages.countDown();
      return;
    }
    const keys = Object.keys(dependencies);
    if (keys.length === 0) {
      this.globalCountDownLatchAllPackages.countDown();
      return;
    }

    // This local latch is initialized with the number of dependencies of the current package.json file for the
    // particular dependency type (normal dependencies, optional ones, peer dependencies) we are analyzing at the
    // moment. Once all sub dependencies for the current package and type have been either
    //
    // a) scheduled for analysis (and have in turn incremented the global count down latch), or
    // b) have been found to not need further analysis,
    //
    // we consider the current node to be done and reduce the global counter/ accordingly.
    const localCountDownLatchForThisNode = new CountDownLatch(keys.length);
    localCountDownLatchForThisNode.once('done', () => {
      this.globalCountDownLatchAllPackages.countDown();
    });

    for (let i = 0; i < keys.length; i++) {
      const dependency = keys[i];
      if (this.distancesFromRoot[dependency]) {
        // We have seen this package before. Do not analyze this package again.
        this.distancesFromRoot[dependency] = Math.min(distance, this.distancesFromRoot[dependency]);
        localCountDownLatchForThisNode.countDown();
        continue;
      }

      // We have not seen this package yet, store the distance for it.
      this.distancesFromRoot[dependency] = distance;

      // Queue this dependency up for further analysis. The local latch is only decremented after we have incremented
      // the/ global latch for this dependency. This makes sure we do not stop the analysis too early.
      this._handleTransitiveDependency(dependency, distance, localCountDownLatchForThisNode);
    }
  }

  /**
   * Handles a single dependency found in a package.json file.
   *
   * @param {string} dependency the name of the dependency to analyze
   * @param {number} distance how far this dependency is from the root package
   * @param {import('./CountDownLatch')} localCountDownLatchForThisNode
   */
  _handleTransitiveDependency(dependency, distance, localCountDownLatchForThisNode) {
    let mainModulePath;
    try {
      mainModulePath = require.resolve(dependency);
    } catch (requireResolveErr) {
      // ignore
      logger.debug(
        `Ignoring failure to resolve the path to dependency ${dependency} for dependency distance calculation.`
      );
    }

    if (!mainModulePath) {
      // Could not find the package.json for this dependency so we cannot analyze it further, which means we are done
      // with it.
      localCountDownLatchForThisNode.countDown();
      logger.debug(`No main module path for dependency ${dependency}.`);
      return;
    }

    findPackageJsonFor(path.dirname(mainModulePath), (err, packageJsonPath) => {
      if (err) {
        localCountDownLatchForThisNode.countDown();
        logger.debug(
          `Ignoring failure to find the package.json file for dependency ${dependency} for dependency distance ` +
            'calculation.',
          err
        );
        return;
      }
      if (typeof packageJsonPath !== 'string') {
        localCountDownLatchForThisNode.countDown();
        logger.debug(
          `Ignoring failure to find the package.json file for dependency ${dependency} for dependency distance ` +
            `calculation (package.json path is ${packageJsonPath}/${typeof packageJsonPath}).`
        );
        return;
      }

      // Recurse one level deeper and queue the next package.json path for analysis.
      this._calculateDistances(packageJsonPath, distance + 1);

      // After the _calculateDistances call we have "handled" the package associated to packageJsonPath, that is, we
      // have (synchronously) incremented the global latch for it. That is, unless we have hit the depth limit, but even
      // then we consider that package to have been handled). Thus, we can now decrement the local latch for it.
      localCountDownLatchForThisNode.countDown();
    });
  }
}

/**
 * Finds the package.json file for a given directory, by starting in the given directory and then travelling the
 * directory tree upwards until a package.json file is found.
 *
 * @param {string} dir
 * @param {(err: Error, packageJsonPath: string) => void} callback
 */

function findPackageJsonFor(dir, callback) {
  const pathToCheck = path.join(dir, 'package.json');
  try {
    fs.stat(pathToCheck, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return searchInParentDir(dir, findPackageJsonFor, callback);
        } else {
          return process.nextTick(callback, err, null);
        }
      }

      if (stats.isFile()) {
        return process.nextTick(callback, null, pathToCheck);
      } else {
        return searchInParentDir(dir, findPackageJsonFor, callback);
      }
    });
  } catch (fsStatErr) {
    // This catch-block is for synchronous errors from fs.stat, which can also happen in addition to the callback being
    // called with an error. The error will be logged in _handleTransitiveDependency.
    return process.nextTick(callback, fsStatErr, null);
  }
}

/**
 * Goes to the parent directory of the given dir and executes the function onParentDir on it.
 *
 * @param {string} dir
 * @param {(parentDir: string, callback: Function) => void} onParentDir
 * @param {(err: Error, packageJsonPath: string) => void} callback
 */
function searchInParentDir(dir, onParentDir, callback) {
  const parentDir = path.resolve(dir, '..');
  if (dir === parentDir) {
    // We have arrived at the root of the file system hierarchy.
    // findPackageJsonFor would have called callback asynchronously,
    // so we use process.nextTick here to make all paths async.
    return process.nextTick(callback, null, null);
  }

  return onParentDir(parentDir, callback);
}

module.exports = {
  DependencyDistanceCalculator,
  MAX_DEPTH: 15,
  __moduleRefExportedForTest: module
};
