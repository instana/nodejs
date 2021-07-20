/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const pidStore = require('../pidStore');

exports.payloadPrefix = 'pid';
// @ts-ignore - Cannot redeclare exported variable
exports.currentPayload = pidStore.pid;

pidStore.onPidChange((/** @type {number} */ pid) => {
  // @ts-ignore - Cannot redeclare exported variable
  exports.currentPayload = pid;
});
