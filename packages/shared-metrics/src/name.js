/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { applicationUnderMonitoring } = require('@instana/core').util;

let logger = require('@instana/core').logger.getLogger('metrics');

/**
 * @param {import('@instana/core/src/logger').GenericLogger} _logger
 */
exports.setLogger = function setLogger(_logger) {
  logger = _logger;
};

exports.payloadPrefix = 'name';
// @ts-ignore
exports.currentPayload = undefined;

const MAX_ATTEMPTS = 60;
const DELAY = 1000;
let attempts = 0;

exports.activate = function activate() {
  attempts++;
  applicationUnderMonitoring.getMainPackageJsonStartingAtMainModule((err, packageJson) => {
    if (err) {
      return logger.warn('Failed to determine main package json. Reason: ', err.message, err.stack);
    } else if (!packageJson && attempts < MAX_ATTEMPTS) {
      logger.debug('Main package.json could not be found. Will try again later.');
      setTimeout(exports.activate, DELAY).unref();
      return;
    } else if (!packageJson) {
      if (process.mainModule) {
        // @ts-ignore
        exports.currentPayload = process.mainModule.filename;
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
