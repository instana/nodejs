/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

const FIRE_MONITORING_EVENT_DURATION_IN_MS = process.env.INSTANA_FIRE_MONITORING_EVENT_DURATION_IN_MS
  ? Number(process.env.INSTANA_FIRE_MONITORING_EVENT_DURATION_IN_MS)
  : 600000;

const hasThePackageBeenInitializedTooLate = require('@instana/core').util.hasThePackageBeenInitializedTooLate;
const agentConnection = require('../agentConnection');

let warningHasBeenLogged = false;

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

exports.check = function check() {
  if (hasThePackageBeenInitializedTooLate.activate()) {
    if (!warningHasBeenLogged) {
      logger.warn(
        'It seems you have initialized the @instana/collector package too late. Please check our documentation on ' +
          'that, in particular ' +
          // eslint-disable-next-line max-len
          'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation#installing-the-collector and ' +
          // eslint-disable-next-line max-len
          'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-troubleshooting. Tracing might only work ' +
          'partially with this setup, that is, some calls will not be captured.'
      );
      warningHasBeenLogged = true;
    }

    fireMonitoringEvent();
    setInterval(fireMonitoringEvent, FIRE_MONITORING_EVENT_DURATION_IN_MS).unref();
  }
};

function fireMonitoringEvent() {
  agentConnection.sendAgentMonitoringEvent('nodejs_collector_initialized_too_late', 'TRACER', error => {
    if (error) {
      logger.error(`Error received while trying to send Agent Monitoring Event to agent: ${error?.message}`);
    }
  });
}
