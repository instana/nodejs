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

exports.payloadPrefix = 'name';
// @ts-ignore
exports.currentPayload = undefined;

exports.MAX_ATTEMPTS = 60;
exports.DELAY = 1000;
let attempts = 0;

exports.activate = function activate() {
  attempts++;

  applicationUnderMonitoring.getMainPackageJsonStartingAtMainModule((err, packageJson) => {
    if (err) {
      return logger.warn(`Failed to determine main package json. Reason: ${err?.message} ${err?.stack}`);
    } else if (!packageJson && attempts < exports.MAX_ATTEMPTS) {
      logger.debug('Main package.json could not be found. Will try again later.');
      setTimeout(exports.activate, exports.DELAY).unref();
      return;
    } else if (!packageJson) {
      if (require.main) {
        // @ts-ignore
        exports.currentPayload = require.main.filename;
      }

      return logger.warn(
        `Main package.json could not be found. This Node.js app will be labeled "${
          exports.currentPayload ? exports.currentPayload : 'Unknown'
        }" in Instana.`
      );
    }

    // @ts-ignore
    exports.currentPayload = packageJson.name;
  });
};

exports.reset = () => {
  exports.currentPayload = undefined;
  exports.MAX_ATTEMPTS = 60;
  exports.DELAY = 1000;
};
