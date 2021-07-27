/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

const internalPidStore = require('./internalPidStore');
const agentOpts = require('../agent/opts');

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('pidStore', newLogger => {
  logger = newLogger;
});

const eventName = 'pidChanged';
const eventEmitter = new EventEmitter();
exports.onPidChange = eventEmitter.on.bind(eventEmitter, eventName);

logger.info('Starting with pid %s', internalPidStore.pid);

Object.defineProperty(exports, 'pid', {
  get: function getPid() {
    return internalPidStore.pid;
  },
  set: function setPid(newPid) {
    if (internalPidStore.pid !== newPid) {
      logger.info('Changing pid to %s', newPid);
      internalPidStore.pid = newPid;
      eventEmitter.emit(eventName, internalPidStore.pid);
    }
  }
});

exports.getEntityId = function getEntityId() {
  return internalPidStore.pid;
};

exports.getFrom = function getFrom() {
  return {
    e: String(exports.pid),
    /** @type {string} */
    h: agentOpts.agentUuid
  };
};

if (!process.env.CONTINUOUS_INTEGRATION) {
  const pidInParentNamespace = getPidFromParentNamespace();
  if (pidInParentNamespace) {
    internalPidStore.pid = pidInParentNamespace;
    logger.info('Changing pid to %s due to successful identification of PID in parent namespace', pidInParentNamespace);
  }
}

function getPidFromParentNamespace() {
  try {
    const schedFileContent = fs.readFileSync(`/proc/${process.pid}/sched`, { encoding: 'utf8' });

    const match = schedFileContent.match(/^[^(]+\((\d+),/im);
    if (!match) {
      logger.debug('Could not locate PID in sched file');
      return null;
    }

    const pidInSchedFile = parseInt(match[1], 10);
    if (pidInSchedFile === process.pid) {
      logger.debug('PID in sched file matches process.pid. Probably not running inside a PID namespace');
      return null;
    }

    return pidInSchedFile;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn('PID could not be read from sched file. Reason: %s', err.message);
    }
  }
}
