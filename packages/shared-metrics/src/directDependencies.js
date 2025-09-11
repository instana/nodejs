/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const { util, uninstrumentedFs: fs } = require('@instana/core');

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

exports.payloadPrefix = 'directDependencies';

/** @type {Object.<string, *>} */
exports.currentPayload = {
  dependencies: {},
  peerDependencies: {},
  optionalDependencies: {}
};

const MAX_ATTEMPTS = 20;
const DELAY = 1000;
let attempts = 0;

exports.deactivate = function deactivate() {
  attempts = 0;
};

exports.activate = function activate() {
  attempts++;
  util.applicationUnderMonitoring.getMainPackageJsonPathStartingAtMainModule((err, packageJsonPath) => {
    if (err) {
      return logger.info(
        `Failed to determine main package.json for analysis of direct dependencies.
        Reason: ${err?.message} ${err?.stack}`
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

/**
 * @param {string} packageJsonPath
 */
function addDirectDependenciesFromMainPackageJson(packageJsonPath) {
  logger.debug(`addDirectDependenciesFromMainPackageJson: ${packageJsonPath}`);

  const started = Date.now();
  fs.readFile(packageJsonPath, { encoding: 'utf8' }, (err, contents) => {
    if (err) {
      return logger.debug(`Failed to analyze direct dependencies dependency due to: ${err?.message}`);
    }

    try {
      const pckg = JSON.parse(contents);
      exports.currentPayload.dependencies = pckg.dependencies || {};
      exports.currentPayload.peerDependencies = pckg.peerDependencies || {};
      exports.currentPayload.optionalDependencies = pckg.optionalDependencies || {};
      exports.currentPayload[pckg.name] = pckg.version;
      logger.debug(`Collection of direct dependencies took ${Date.now() - started} ms.`);
    } catch (subErr) {
      logger.debug(`Collection of direct dependencies took ${Date.now() - started} ms.`);
      return logger.debug(`Failed to parse package.json ${packageJsonPath} dependency due to: ${subErr?.message}`);
    }
  });
}
