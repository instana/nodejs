'use strict';

const { environment: environmentUtil } = require('@instana/serverless');

environmentUtil.validate();

if (environmentUtil.isValid()) {
  module.exports = exports = require('./activate');
} else {
  module.exports = exports = require('./noop');
}
