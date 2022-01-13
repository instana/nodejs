/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { util: coreUtil } = require('@instana/core');
const agentOpts = require('./agent/opts');

// This file can be used with NODE_OPTIONS or `node --require` to instrument a Node.js app with Instana without
// modifying the source code. See
// eslint-disable-next-line max-len
// https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#installation-without-modifying-the-source-code

const isExcludedFromInstrumentation = coreUtil.excludedFromInstrumentation && coreUtil.excludedFromInstrumentation();

// In case this is a child process of an instrumented parent process we might receive the agent uuid from the parent
// process to be able to produce and collect spans immediately without waiting for a connection to the agent in this
// process.
const parentProcessAgentUuid = process.env.INSTANA_AGENT_UUID;

if (!isExcludedFromInstrumentation) {
  if (parentProcessAgentUuid) {
    // @ts-ignore - Type 'string' is not assignable to type 'undefined'
    // Probably because exports.agentUuid is set to undefined and export values were not supposed to be changed
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
