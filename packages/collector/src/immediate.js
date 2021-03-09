/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { util: coreUtil } = require('@instana/core');
const agentOpts = require('./agent/opts');

// This file can be used with NODE_OPTIONS or `node --require` to instrument a Node.js app with Instana without
// modifying the source code. See
// https://www.instana.com/docs/ecosystem/node-js/installation#installation-without-modifying-the-source-code

const isExcludedFromInstrumentation = coreUtil.excludedFromInstrumentation && coreUtil.excludedFromInstrumentation();

// In case this is a child process of an instrumented parent process we might receive the agent uuid from the parent
// process to be able to produce and collect spans immediately without waiting for a connection to the agent in this
// process.
const parentProcessAgentUuid = process.env.INSTANA_AGENT_UUID;

if (!isExcludedFromInstrumentation) {
  if (parentProcessAgentUuid) {
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
