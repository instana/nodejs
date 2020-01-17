'use strict';

var fs = require('fs');
var path = require('path');

var logger;
logger = require('../../../logger').getLogger('tracing/selfPath', function(newLogger) {
  logger = newLogger;
});

exports.collectorPath = path.join(__dirname, '..', '..', '..', '..', '..', 'collector');
exports.immediate = path.join(exports.collectorPath, 'src', 'immediate');

if (!fs.existsSync(exports.collectorPath)) {
  logger.debug('Unable to find path to @instana/collector, edgemicro instrumentation will not be available.');
  exports.collectorPath = null;
  exports.immediate = null;
} else {
  logger.debug(
    "Found path to @instana/collector at '" + exports.collectorPath + "', edgemicro instrumentation will be available."
  );
}
