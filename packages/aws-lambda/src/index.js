/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { environment: environmentUtil } = require('@instana/serverless');
const ssm = require('./ssm');

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
