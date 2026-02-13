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

async function createSdkSpan() {
  await instana.sdk.async.startEntrySpan('span-name');
  await simulateWork();
  instana.sdk.async.completeEntrySpan();
}

async function trigger() {
  await createSdkSpan();
}

setInterval(trigger, delayBetweenCalls);
