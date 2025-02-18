/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const path = require('path');

const lag = require('event-loop-lag')(1000);

/** @type {*} */
let eventLoopStats;

exports.payloadPrefix = 'libuv';

const nativeModuleLoader = require('./util/nativeModuleRetry')({
  nativeModuleName: 'event-loop-stats',
  moduleRoot: path.join(__dirname, '..'),
  message:
    'Could not load event-loop-stats. You will only see limited event loop information in Instana for this ' +
    'application. This typically occurs when native addons could not be built during module installation ' +
    '(npm install/yarn) or when npm install --no-optional or yarn --ignore-optional have been used to install ' +
    'dependencies. See the instructions to learn more about the requirements of the collector: ' +
    'https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#native-add-ons'
});

nativeModuleLoader.once('loaded', eventLoopStats_ => {
  eventLoopStats = eventLoopStats_;
});

nativeModuleLoader.once('failed', () => {
  exports.currentPayload.statsSupported = false;
});

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
