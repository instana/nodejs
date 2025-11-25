/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

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

// @ts-ignore
exports.activate = function activate(config, packageJsonObj) {
  if (!packageJsonObj || !packageJsonObj.file) {
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
  exports.currentPayload = packageJsonObj.file.name;
};

exports.reset = () => {
  exports.currentPayload = undefined;
};
