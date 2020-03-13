'use strict';

var fs = require('fs');
var path = require('path');

var logger;
logger = require('../../../logger').getLogger('tracing/selfPath', function(newLogger) {
  logger = newLogger;
});

exports.immediate = path.join(__dirname, '..', '..', '..', 'immediate.js');

if (!fs.existsSync(exports.immediate)) {
  logger.debug('Unable to find path to @instana/collector, edgemicro instrumentation will not be available.');
  exports.immediate = null;
}
