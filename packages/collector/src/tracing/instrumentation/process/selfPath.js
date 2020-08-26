'use strict';

const fs = require('fs');
const path = require('path');

let logger;
logger = require('../../../logger').getLogger('tracing/selfPath', newLogger => {
  logger = newLogger;
});

exports.immediate = path.join(__dirname, '..', '..', '..', 'immediate.js');

if (!fs.existsSync(exports.immediate)) {
  logger.debug('Unable to find path to @instana/collector, edgemicro instrumentation will not be available.');
  exports.immediate = null;
}
