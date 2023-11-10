/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { isNodeJsTooOld } = require('@instana/core/src/util/nodeJsVersionCheck');

const minimumNodeJsVersion = '16.0.0';

if (isNodeJsTooOld() && process.version >= minimumNodeJsVersion) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/azure-app-service requires at least Node.js ${minimumNodeJsVersion} but this process is ` +
      `running on Node.js ${process.version}. This azure app service will not be monitored by Instana.`
  );
  return;
}

const { util: coreUtil } = require('@instana/core');
const { environment: environmentUtil } = require('@instana/serverless');

const isExcludedFromInstrumentation = coreUtil.excludedFromInstrumentation && coreUtil.excludedFromInstrumentation();

if (!isExcludedFromInstrumentation) {
  environmentUtil.validate();
}

if (!isExcludedFromInstrumentation && environmentUtil.isValid()) {
  module.exports = exports = require('./activate');
} else {
  module.exports = exports = require('./noop');
}
