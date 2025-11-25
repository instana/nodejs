/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const { uninstrumentedFs: fs } = require('@instana/core');

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

exports.deactivate = function deactivate() {};

// @ts-ignore
exports.activate = function activate(config, packageJsonObj) {
  if (!packageJsonObj || !packageJsonObj.file) {
    return;
  }

  const started = Date.now();
  const packageJson = packageJsonObj.file;

  try {
    exports.currentPayload.dependencies = packageJson.dependencies || {};
    exports.currentPayload.peerDependencies = packageJson.peerDependencies || {};
    exports.currentPayload.optionalDependencies = packageJson.optionalDependencies || {};
    exports.currentPayload[packageJson.name] = packageJson.version;
    logger.debug(`Collection of direct dependencies took ${Date.now() - started} ms.`);
  } catch (subErr) {
    logger.debug(`Collection of direct dependencies took ${Date.now() - started} ms.`);
    return logger.debug(`Failed to parse package.json dependency due to: ${subErr?.message}`);
  }
};
