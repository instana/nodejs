/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');
const { esm: esmUtil } = require('@instana/core/src/util');

// As of now, Azure App Service supports Node.js versions 16-lts,18-lts and 20-lts. However, for existing services,
// older Node.js versions might still be supported. You can find more information about configuring Node.js on Azure
// App Service at: https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs?pivots=platform-linux

if (isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/azure-container-services requires at least Node.js ${minimumNodeJsVersion} but this` +
      `process is running on Node.js ${process.version}. This azure container service will not be monitored by Instana.`
  );
  return;
}

if (esmUtil.hasExperimentalLoaderFlag()) {
  // eslint-disable-next-line no-console
  console.error(
    'Node.js introduced breaking changes in versions 18.19.0 and above, leading to the discontinuation of support ' +
      `for the --experimental-loader flag by Instana. The current Node.js version is ${process.version} and ` +
      'this process will not be monitored by Instana. ' +
      "To ensure tracing by Instana, please use the '--import' flag instead. For more information, " +
      'refer to the Instana documentation: ' +
      'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation.'
  );
  return;
}

// This loader worked with '--experimental-loader' in Node.js versions below 18.19.
// TODO: Remove 'esm-loader.mjs' file and this log in the next major release (v6).
if (esmUtil.hasEsmLoaderFile()) {
  // eslint-disable-next-line no-console
  console.error(
    "Detected use of 'esm-loader.mjs'. This file is no longer supported and will be removed in next major release. " +
      'This process will not be monitored by Instana. ' +
      "To ensure tracing by Instana, please use the 'esm-register.mjs' file instead. For more information, " +
      'refer to the Instana documentation: ' +
      'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation.'
  );
  return;
}

const { util: coreUtil } = require('@instana/core');
const { environment: environmentUtil, consoleLogger: log } = require('@instana/serverless');

// TODO: we currently call "log.init()" twice. Once here
//       and once in the activate.js. Please merge.
const logger = log.init();
environmentUtil.init({ logger });

const isExcludedFromInstrumentation = coreUtil.excludedFromInstrumentation && coreUtil.excludedFromInstrumentation();

if (!isExcludedFromInstrumentation) {
  environmentUtil.validate();
}

if (!isExcludedFromInstrumentation && environmentUtil.isValid()) {
  module.exports = exports = require('./activate');
} else {
  module.exports = exports = require('./noop');
}
