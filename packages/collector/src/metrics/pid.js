/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

let pid;

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 * @param {{ pid: number, onPidChange: (callback: (pid: number) => void) => void }} pidStore
 */
exports.init = function init(config, pidStore) {
  pid = pidStore.pid;

  exports.currentPayload = pid;

  pidStore.onPidChange(_pid => {
    exports.currentPayload = _pid;
  });
};

exports.payloadPrefix = 'pid';
exports.currentPayload = null;
