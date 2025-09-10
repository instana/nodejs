/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

/** @type {import('@instana/core/src/util').CoreUtilsType} */
let coreUtils;

/**
 * @param {import('@instana/core/src/config/normalizeConfig').InstanaConfig} config
 * @param {import('@instana/core/src/util').CoreUtilsType} utils
 *
 */
exports.init = function init(config, utils) {
  logger = config.logger;
  coreUtils = utils;
};

exports.payloadPrefix = 'version';
// @ts-ignore
exports.currentPayload = undefined;

const MAX_ATTEMPTS = 20;
const DELAY = 1000;
let attempts = 0;

exports.activate = function activate() {
  attempts++;

  coreUtils.applicationUnderMonitoring.getMainPackageJsonStartingAtMainModule((err, packageJson) => {
    if (err) {
      return logger.warn(`Failed to determine main package json. Reason: ${err?.message} ${err?.stack}`);
    } else if (!packageJson && attempts < MAX_ATTEMPTS) {
      setTimeout(exports.activate, DELAY).unref();

      return;
    } else if (!packageJson) {
      // final attempt failed, ignore silently
      return;
    }

    // @ts-ignore
    exports.currentPayload = packageJson.version;
  });
};
