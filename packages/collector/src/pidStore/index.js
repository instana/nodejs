/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const EventEmitter = require('events').EventEmitter;

const { uninstrumentedFs: fs } = require('@instana/core');
const internalPidStore = require('./internalPidStore');
const agentOpts = require('../agent/opts');

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;

const eventName = 'pidChanged';

/** @type {import('events').EventEmitter} */
let eventEmitter;

/**
 * @param {import('@instana/core/src/config/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
  eventEmitter = new EventEmitter();

  logger.info(`PID Store starting with pid ${internalPidStore.pid}`);

  if (!process.env.CONTINUOUS_INTEGRATION) {
    const pidInParentNamespace = getPidFromParentNamespace();

    if (pidInParentNamespace) {
      internalPidStore.pid = pidInParentNamespace;
      logger.info(
        `Changing pid to ${pidInParentNamespace} due to successful identification of PID in parent namespace`
      );
    }
  }
};

/**
 * @param {*} cb
 */
exports.onPidChange = cb => {
  return eventEmitter.on(eventName, cb);
};

Object.defineProperty(exports, 'pid', {
  get: function getPid() {
    return internalPidStore.pid;
  },
  set: function setPid(newPid) {
    if (internalPidStore.pid !== newPid) {
      logger.info(`Changing pid to ${newPid}`);
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
      logger.warn(`PID could not be read from sched file. Reason: ${err?.message}`);
    }
  }
}
