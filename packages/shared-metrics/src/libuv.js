/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const path = require('path');

const lag = require('event-loop-lag')(1000);

let eventLoopStats;

exports.payloadPrefix = 'libuv';
exports.currentPayload = {};

const nativeModuleLoader = require('./util/nativeModuleRetry')({
  nativeModuleName: 'event-loop-stats',
  moduleRoot: path.join(__dirname, '..'),
  message:
    'Could not load event-loop-stats. You will only see limited event loop information in ' +
    'Instana for this application. This typically occurs when native addons could not be ' +
    'installed during module installation (npm install). See the instructions to learn more ' +
    'about the requirements of the collector: ' +
    'https://www.instana.com/docs/ecosystem/node-js/installation/#native-addons'
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
  if (eventLoopStats) {
    const stats = eventLoopStats.sense();
    stats.statsSupported = true;
    return stats;
  }
  return {};
}
