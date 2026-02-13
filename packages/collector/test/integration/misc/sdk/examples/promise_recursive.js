#!/usr/bin/env node
/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const instana = require('@instana/collector')({
  serviceName: require('path').basename(__filename)
});

// eslint-disable-next-line no-unused-vars
// const heapdump = require('heapdump');
const { delayBetweenCalls, simulateWork } = require('./util');

function createSdkSpan() {
  return instana.sdk.promise.startEntrySpan('span-name').then(() => {
    simulateWork().then(() => {
      instana.sdk.promise.completeEntrySpan();
    });
  });
}

function trigger() {
  createSdkSpan().then(() => {
    setTimeout(trigger, delayBetweenCalls);
  });
}

setTimeout(trigger, 3000);
