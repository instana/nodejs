'use strict';

var logger;
logger = require('../logger').getLogger('util/initializedTooLate', function(newLogger) {
  logger = newLogger;
});

var hasThePackageBeenInitializedTooLate = require('@instana/core').util.hasThePackageBeenInitializedTooLate;
var agentConnection = require('../agentConnection');

var warningHasBeenLogged = false;

exports.check = function check() {
  if (hasThePackageBeenInitializedTooLate()) {
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

    fireMonitoringEvent();
    setInterval(fireMonitoringEvent, 600000).unref();
  }
};

function fireMonitoringEvent() {
  agentConnection.sendAgentMonitoringEvent('nodejs_collector_initialized_too_late', 'TRACER', function(error) {
    if (error) {
      logger.error('Error received while trying to send Agent Monitoring Event to agent: %s', error.message);
    }
  });
}
