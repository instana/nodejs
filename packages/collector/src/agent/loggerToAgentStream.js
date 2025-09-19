/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const pidStore = require('../pidStore/internalPidStore');

/** @type {import('../agentConnection')} */
let downstreamConnection;

/** @type {NodeJS.WritableStream & {
 *    setDownstreamConnection: (downstreamConnection: import('../agentConnection')) => void
 * }} */
module.exports = {
  /**
   * @param {*} record
   */
  write: function write(record) {
    try {
      record = JSON.parse(record);
    } catch (error) {
      // ignore
    }

    const logLevel = getAgentLogLevel(record.level);
    let message = `Node.js collector (pid: ${process.pid}, reporting pid: ${pidStore.pid}): ${record.msg}`;
    let stack = null;

    if (record.err) {
      message += `: ${record.err.message}`;
      stack = record.err.stack;
    }

    // CASE: It could be that the preinit functionality calls the logger before the agent connection is properly set up.
    if (downstreamConnection) {
      downstreamConnection.sendLogToAgent(logLevel, message, stack);
    }
  },

  /**
   * @param {import('../agentConnection')} _downstreamConnection
   */
  setDownstreamConnection: _downstreamConnection => {
    downstreamConnection = _downstreamConnection;
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
