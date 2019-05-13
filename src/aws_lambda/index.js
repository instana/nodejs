'use strict';

const https = require('https');

const environmentUtil = require('../util/environment');

environmentUtil.validate();

if (environmentUtil.isValid()) {
  module.exports = exports = require('./wrapper');
} else {
  module.exports = exports = require('./noop_wrapper');
}
