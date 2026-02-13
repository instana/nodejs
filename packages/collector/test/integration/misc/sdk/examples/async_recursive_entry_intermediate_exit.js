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
  for (let i = 0; i < 2; i++) {
    // eslint-disable-next-line no-await-in-loop
    await createIntermediateSpanWithExitChildren();
    // eslint-disable-next-line no-await-in-loop
    await simulateWork();
  }
  instana.sdk.async.completeEntrySpan();
}

async function createIntermediateSpanWithExitChildren() {
  await instana.sdk.async.startIntermediateSpan('span-name-intermediate');
  await simulateWork();
  for (let i = 0; i < 2; i++) {
    // eslint-disable-next-line no-await-in-loop
    await createExitSpan();
    // eslint-disable-next-line no-await-in-loop
    await simulateWork();
  }
  instana.sdk.async.completeIntermediateSpan();
}

async function createExitSpan() {
  await instana.sdk.async.startExitSpan('span-name-exit');
  await simulateWork();
  instana.sdk.async.completeExitSpan();
}

async function trigger() {
  await createSdkSpan();
  if (process.env.DEBUG_CLS) {
    process._rawDebug('----');
  }
  setTimeout(trigger, delayBetweenCalls);
}

setTimeout(trigger, 3000);
