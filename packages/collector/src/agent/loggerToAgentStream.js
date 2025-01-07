/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const log = require('./log');

const pidStore = require('../pidStore/internalPidStore');

/** @type {NodeJS.WritableStream} */
module.exports = {
  /**
   * @param {*} record
   */
  write: function write(record) {
    const logLevel = getAgentLogLevel(record.level);
    let message = `Node.js collector (pid: ${process.pid}, reporting pid: ${pidStore.pid}): ${record.msg}`;
    let stack = null;

    if (record.err) {
      message += `: ${record.err.message}`;
      stack = record.err.stack;
    }

    log(logLevel, message, stack);
  }
};

/**
 * @param {number} level
 * @returns {'debug' | 'info' | 'warning' | 'error'}
 */
function getAgentLogLevel(level) {
  if (level < 30) {
    return 'debug';
  } else if (level < 40) {
    return 'info';
  } else if (level < 50) {
    return 'warning';
  }

  return 'error';
}
