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
const { delayBetweenCalls, simulateWorkCallback } = require('./util');

function createSdkSpan() {
  instana.sdk.callback.startEntrySpan('span-name', () => {
    simulateWorkCallback(() => {
      instana.sdk.callback.completeEntrySpan();
    });
  });
}

async function trigger() {
  createSdkSpan();
}

setInterval(trigger, delayBetweenCalls);
