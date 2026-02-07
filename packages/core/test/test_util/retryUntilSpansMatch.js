/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const retry = require('@_local/core/test/test_util/retry');

// Ideally, we should use the type above for the agentConrols, but this is currently out of the scope for this ticket
module.exports = function retryUntilSpansMatch(agentControls, fn) {
  return retry(() => agentControls.getSpans().then((/** @type {*} */ spans) => fn(spans)));
};
