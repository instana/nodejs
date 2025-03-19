/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const path = require('path');
const nativeModuleRetry = require('./util/nativeModuleRetry');
const lag = require('event-loop-lag')(1000);

/** @type {*} */
let eventLoopStats;

exports.payloadPrefix = 'libuv';

exports.init = function init() {
  const nativeModuleLoader = nativeModuleRetry.loadNativeAddOn({
    nativeModuleName: 'event-loop-stats',
    moduleRoot: path.join(__dirname, '..'),
    message:
      'Could not load event-loop-stats. Event loop information will be limited in Instana for this application. ' +
      'This typically occurs when native add-ons fail to build during module installation. ' +
      'However, general tracing functionality remains unaffected. Enable debug logging for more details. ' +
      'For more information on native add-ons, visit: ' +
      'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation#native-add-ons'
  });

  nativeModuleLoader.once('loaded', eventLoopStats_ => {
    eventLoopStats = eventLoopStats_;
  });

  nativeModuleLoader.once('failed', () => {
    exports.currentPayload.statsSupported = false;
  });
};

Object.defineProperty(exports, 'currentPayload', {
  get: function () {
    const stats = sense();
    stats.lag = Math.round(lag() * 100) / 100;
    return stats;
  }
});

function sense() {
  // CASE: If the c++ module does not support the env, it might export `sense` as undefined.
  //       See https://github.com/bripkens/event-loop-stats/blob/v1.4.1/src/eventLoopStats.js#L1-L2
  if (eventLoopStats && eventLoopStats.sense) {
    const stats = eventLoopStats.sense();
    stats.statsSupported = true;
    return stats;
  }
  return {
    statsSupported: false
  };
}
