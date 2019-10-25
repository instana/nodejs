'use strict';

const { environment: environmentUtil } = require('@instana/serverless');

environmentUtil.validate();

if (environmentUtil.isValid()) {
  module.exports = exports = require('./wrapper');
  // required for backwards compatibility for first four beta customers
  exports.awsLambda = module.exports;
} else {
  module.exports = exports = require('./noop_wrapper');
  // required for backwards compatibility for first four beta customers
  exports.awsLambda = module.exports;
}
