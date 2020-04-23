'use strict';

var logger;
logger = require('../logger').getLogger('metrics/initializedTooLate', function(newLogger) {
  logger = newLogger;
});
var hasThePackageBeenInitializedTooLate = require('@instana/core').util.hasThePackageBeenInitializedTooLate;
var downstreamConnection = require('../agentConnection');

exports.payloadPrefix = 'initTooLate';
exports.currentPayload = undefined;
var warningHasBeenLogged = false;

exports.activate = function() {
  if (hasThePackageBeenInitializedTooLate()) {
    downstreamConnection.sendAgentMonitoringEvent('nodejs_collector_initialized_too_late', function(error) {
      if (error) {
        logger.error('Error received while trying to send Agent Monitoring Event to agent: %s', error.message);
      }
    });

    exports.currentPayload = true;
    if (!warningHasBeenLogged) {
      logger.warn(
        'It seems you have initialized the @instana/collector package too late. Please check our documentation on ' +
          'that, in particular ' +
          'https://docs.instana.io/ecosystem/node-js/installation/#installing-the-nodejs-collector-package and ' +
          'https://docs.instana.io/ecosystem/node-js/installation/#common-pitfalls. Tracing might only work ' +
          'partially with this setup, that is, some calls will not be captured.'
      );
      warningHasBeenLogged = true;
    }
  }
};
