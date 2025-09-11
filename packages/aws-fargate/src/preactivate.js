/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');

if (isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/aws-fargate requires at least Node.js ${minimumNodeJsVersion} but this process is ` +
      `running on Node.js ${process.version}. This Fargate container will not be monitored by Instana.` +
      'See https://www.ibm.com/docs/en/instana-observability/current?topic=agents-aws-fargate#versioning.'
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
