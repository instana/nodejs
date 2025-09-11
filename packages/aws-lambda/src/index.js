/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');

if (isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/aws-lambda requires at least Node.js ${minimumNodeJsVersion} but this Lambda function is ` +
      `running on Node.js ${process.version}. This Lambda will not be monitored by Instana.`
  );
  return;
}

const { environment: environmentUtil, consoleLogger: serverlessLogger } = require('@instana/serverless');
const ssm = require('./ssm');
const path = require('path');
// eslint-disable-next-line no-console
console.log('@instana/aws-lambda module version:', require(path.join(__dirname, '..', 'package.json')).version);

// TODO: we currently call "log.init()" twice. Once here
//       and once in the wrapper.js. Please merge.
const logger = serverlessLogger.init();
environmentUtil.init({ logger });

environmentUtil.validate({
  validateInstanaAgentKey: ssm.validate
});

if (environmentUtil.isValid()) {
  module.exports = exports = require('./wrapper');
} else {
  module.exports = exports = require('./noop_wrapper');
}

// required for backwards compatibility
exports.awsLambda = module.exports;
