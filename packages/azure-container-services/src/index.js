/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');
const hasExperimentalLoaderFlag = require('@instana/core').tracing.hasExperimentalLoaderFlag;

// As of now, Azure App Service supports Node.js versions 16-lts,18-lts and 20-lts. However, for existing services,
// older Node.js versions might still be supported. You can find more information about configuring Node.js on Azure
// App Service at: https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs?pivots=platform-linux

if (isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/azure-container-services requires at least Node.js ${minimumNodeJsVersion} but this` +
      `process is running on Node.js ${process.version}. This azure container service will not be monitored by Instana.`
  );
  module.exports = exports = require('./noop');
}
if (hasExperimentalLoaderFlag) {
  // eslint-disable-next-line no-console
  console.error(
    "Instana no longer supports the '--experimental-loader' flag starting from Node.js 18.19.0. The current Node.js " +
      `version is ${process.version}. To be monitored by Instana, please use the '--import' flag instead. ` +
      'Refer to the Instana documentation for further details.'
  );
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
