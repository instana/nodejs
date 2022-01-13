/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('util/initializedTooLate', newLogger => {
  logger = newLogger;
});

const hasThePackageBeenInitializedTooLate = require('@instana/core').util.hasThePackageBeenInitializedTooLate;
const agentConnection = require('../agentConnection');

let warningHasBeenLogged = false;

exports.check = function check() {
  if (hasThePackageBeenInitializedTooLate()) {
    if (!warningHasBeenLogged) {
      logger.warn(
        'It seems you have initialized the @instana/collector package too late. Please check our documentation on ' +
          'that, in particular ' +
          // eslint-disable-next-line max-len
          'https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#installing-the-nodejs-collector-package and ' +
          // eslint-disable-next-line max-len
          'https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#common-pitfalls. Tracing might only work ' +
          'partially with this setup, that is, some calls will not be captured.'
      );
      warningHasBeenLogged = true;
    }

    fireMonitoringEvent();
    setInterval(fireMonitoringEvent, 600000).unref();
  }
};

function fireMonitoringEvent() {
  agentConnection.sendAgentMonitoringEvent('nodejs_collector_initialized_too_late', 'TRACER', error => {
    if (error) {
      logger.error('Error received while trying to send Agent Monitoring Event to agent: %s', error.message);
    }
  });
}
