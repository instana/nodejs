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
const agentOpts = require('./agent/opts');

// This file can be used with NODE_OPTIONS or `node --require` to instrument a Node.js app with Instana without
// modifying the source code. See
// eslint-disable-next-line max-len
// https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation#activating-the-collector

const isExcludedFromInstrumentation = coreUtil.excludedFromInstrumentation && coreUtil.excludedFromInstrumentation();

// In case this is a child process of an instrumented parent process we might receive the agent uuid from the parent
// process to be able to produce and collect spans immediately without waiting for a connection to the agent in this
// process.
// TODO: This does not work because you would report spans with parent agent uuid and the child process pid -
//       this is not compatible. Our codebase does not support this.
const parentProcessAgentUuid = process.env.INSTANA_AGENT_UUID;

if (!isExcludedFromInstrumentation) {
  if (parentProcessAgentUuid) {
    // @ts-ignore - Type 'string' is not assignable to type 'undefined'
    // Probably because exports.agentUuid is set to undefined and export values were not supposed to be changed
    // TODO: This has no effect. Remove! See comment above.
    agentOpts.agentUuid = parentProcessAgentUuid;
    require('./index')({
      tracing: {
        activateImmediately: true,
        activateBullProcessInstrumentation: true,
        forceTransmissionStartingAt: 1
      }
    });
  } else {
    require('./index')();
  }
}
