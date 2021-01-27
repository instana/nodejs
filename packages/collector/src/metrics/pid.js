/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const pidStore = require('../pidStore');

exports.payloadPrefix = 'pid';
exports.currentPayload = pidStore.pid;

pidStore.onPidChange(pid => {
  exports.currentPayload = pid;
});
