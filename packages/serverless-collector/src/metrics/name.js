/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const instanaCore = require('@instana/core');

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

// NOTE:
// The service name will be "localhost" because the serverless collector does not support
// metrics. Metrics contain the package.json name. AFAIK there is currently
// no way to connect metrics with spans for **agentless non serverless** environments.
// https://jsw.ibm.com/browse/INSTA-3607
module.exports = config => {
  logger = config.logger;

  if (process.env.INSTANA_SERVICE_NAME) {
    return process.env.INSTANA_SERVICE_NAME;
  }

  return new Promise(resolve => {
    instanaCore.util.applicationUnderMonitoring.getMainPackageJsonStartingAtMainModule((err, packageJsonObj) => {
      if (err) {
        logger.debug(`Failed to determine main package.json. ${err?.message} ${err?.stack}`);
        return resolve();
      }

      logger.debug(`Found main package.json: ${packageJsonObj.file.name}`);
      resolve(packageJsonObj.file.name);
    });
  });
};
