/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { applicationUnderMonitoring } = require('@instana/core').util;

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

exports.payloadPrefix = 'version';
// @ts-ignore
exports.currentPayload = undefined;

const MAX_ATTEMPTS = 20;
const DELAY = 1000;
let attempts = 0;

exports.activate = function activate() {
  attempts++;

  // TODO: all metrics call `getMainPackageJsonStartingAtMainModule` - if `getMainPackageJsonStartingAtMainModule` fails
  //       for the 1st metrics, the other metrics will try again...we should initiate
  //       `getMainPackageJsonStartingAtMainModule` only once in a central place!
  applicationUnderMonitoring.getMainPackageJsonStartingAtMainModule((err, packageJson) => {
    if (err) {
      return logger.warn(
        // eslint-disable-next-line max-len
        `Failed to determine main package.json for "${exports.payloadPrefix}" metric. Reason: ${err?.message} ${err?.stack}`
      );
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
