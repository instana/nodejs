/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { applicationUnderMonitoring } = require('@instana/core').util;

let logger = require('@instana/core').logger.getLogger('metrics');

/**
 * @param {import('@instana/core/src/core').GenericLogger} _logger
 */
exports.setLogger = _logger => {
  logger = _logger;
};

exports.payloadPrefix = 'description';
// @ts-ignore
exports.currentPayload = undefined;

const MAX_ATTEMPTS = 20;
const DELAY = 1000;
let attempts = 0;

/**
 * @param {import('@instana/core/src/util/normalizeConfig').InstanaConfig} config
 */
exports.activate = function activate(config) {
  attempts++;
  applicationUnderMonitoring.getMainPackageJsonStartingAtMainModule(config, (err, packageJson) => {
    if (err) {
      return logger.warn(`Failed to determine main package json. Reason: ${err?.message} ${err?.stack}`);
    } else if (!packageJson && attempts < MAX_ATTEMPTS) {
      setTimeout(() => {
        exports.activate(config);
      }, DELAY).unref();

      return;
    } else if (!packageJson) {
      // final attempt failed, ignore silently
      return;
    }

    // @ts-ignore
    exports.currentPayload = packageJson.description;
  });
};
