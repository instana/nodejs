/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { esm, nodeJsVersionCheck } = require('@instana/core/src/util');

if (nodeJsVersionCheck.isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    // eslint-disable-next-line max-len
    `The package @instana/serverless-collector requires at least Node.js v${nodeJsVersionCheck.minimumNodeJsVersion} but this ` +
      `process is running on Node.js ${process.version}. This process will not be traced by Instana.`
  );
  return;
}

// Check for unsupported ESM loader configurations and exit early
if (esm.hasExperimentalLoaderFlag()) {
  // eslint-disable-next-line no-console
  console.error(
    "Node.js 18.19.0 and later no longer support the '--experimental-loader' flag for ESM. " +
      `Your current version is ${process.version}. To ensure tracing by Instana, ` +
      "please use the '--import' flag instead. For more information, refer to the Instana documentation: " +
      'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation.'
  );
  return;
}

// This loader worked with '--experimental-loader' in Node.js versions below 18.19.
// TODO: Remove 'esm-loader.mjs' file and this log in the next major release (v6).
if (esm.hasEsmLoaderFile()) {
  // eslint-disable-next-line no-console
  console.error(
    "Importing 'esm-loader.mjs' is not supported and will be removed in next major release. " +
      'This process will not be monitored by Instana. ' +
      "Use 'esm-register.mjs' with '--import' to enable tracing.  For more information, " +
      'refer to the Instana documentation: ' +
      'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation.'
  );
  return;
}

const { util: coreUtil } = require('@instana/core');
const { environment: environmentUtil, consoleLogger: serverlessLogger } = require('@instana/serverless');

// TODO: we currently call "log.init()" twice. Once here
//       and once in the activate.js. Please merge.
const logger = serverlessLogger.init();
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
