/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const retry = require('./retry');

/**
 * typedef {import('../../../collector/test/apps/agentStubControls').AgentStubControls} AgentStubControls
 */

// Ideally, we should use the type above for the agentConrols, but this is currently out of the scope for this ticket

/**
 * @param {*} agentControls
 * @param {Function} fn
 * @returns
 */
module.exports = function retryUntilSpansMatch(agentControls, fn) {
  return retry(() => agentControls.getSpans().then((/** @type {*} */ spans) => fn(spans)));
};
