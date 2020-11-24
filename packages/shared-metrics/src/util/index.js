'use strict';

module.exports = exports = {
  nativeModuleRetry: require('./nativeModuleRetry'),
  setLogger: function setLogger(logger) {
    exports.nativeModuleRetry.setLogger(logger);
  }
};
