'use strict';

const https = require('https');
const instanaUrlUtil = require('../util/instana_url');

const logger = require('../util/logger');

instanaUrlUtil.validate();

if (instanaUrlUtil.isValid()) {
  module.exports = exports = require('./wrapper');
} else {
  module.exports = exports = require('./noop_wrapper');
}
