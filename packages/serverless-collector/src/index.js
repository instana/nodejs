/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');

if (isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/serverless-collector requires at least Node.js v${minimumNodeJsVersion} but this ` +
      `process is running on Node.js ${process.version}. This process will not be traced by Instana.`
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
