'use strict';

const pidStore = require('../pidStore');

exports.payloadPrefix = 'pid';
exports.currentPayload = pidStore.pid;

pidStore.onPidChange(pid => {
  exports.currentPayload = pid;
});
