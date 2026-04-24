/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');

if (isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/collector requires at least Node.js ${minimumNodeJsVersion} but this process is ` +
      `running Node.js ${process.version}. This process will not be monitored by Instana.`
  );
  // @ts-ignore TS1108 (return can only be used within a function body)
  return;
}

const { util: coreUtil } = require('@instana/core');

// This file can be used with NODE_OPTIONS or `node --require` to instrument a Node.js app with Instana without
// modifying the source code. See
// eslint-disable-next-line max-len
// https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation#activating-the-collector

const isExcludedFromInstrumentation = coreUtil.excludedFromInstrumentation && coreUtil.excludedFromInstrumentation();

// CASE: This process is a forked child process of a bull worker.
const currentProcessIsBullChildProcess = process.env.INSTANA_IS_BULL_CHILD_PROCESS === 'true';

if (!isExcludedFromInstrumentation) {
  if (currentProcessIsBullChildProcess) {
    require('./index')({
      tracing: {
        // If we don't ACTIVATE the process instrumentation for bull forked processes immediately, we miss this event.
        activateBullProcessInstrumentation: true,
        forceTransmissionStartingAt: 1
      }
    });
  } else {
    require('./index')();
  }
}
