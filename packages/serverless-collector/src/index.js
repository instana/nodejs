/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { consoleLogger } = require('@instana/serverless');

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');

const logger = consoleLogger;

if (process.env.INSTANA_DEBUG || process.env.INSTANA_LOG_LEVEL) {
  logger.setLevel(process.env.INSTANA_DEBUG ? 'debug' : process.env.INSTANA_LOG_LEVEL);
}

if (isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/serverless-collector requires at least Node.js v${minimumNodeJsVersion} but this ` +
      `process is running on Node.js ${process.version}. This process will not be traced by Instana.`
  );
  return;
}

const { util: coreUtil } = require('@instana/core');
const { environment: environmentUtil } = require('@instana/serverless');

const isExcludedFromInstrumentation = coreUtil.excludedFromInstrumentation && coreUtil.excludedFromInstrumentation();

if (!isExcludedFromInstrumentation) {
  logger.debug('Validating environmentUtil');
  environmentUtil.validate();
}

if (!isExcludedFromInstrumentation && environmentUtil.isValid()) {
  logger.debug('success: Validating environmentUtil and activating');
  module.exports = exports = require('./activate');
} else {
  logger.debug('failure: Validating environmentUtil');
  module.exports = exports = require('./noop');
}
