/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const fs = require('fs');

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('./logger').getLogger('cmdline', newLogger => {
  logger = newLogger;
});

exports.getCmdline = function getCmdline() {
  let name;
  /** @type {Array.<string>} */
  let args;

  try {
    const cmdlineAsString = fs.readFileSync(`/proc/${process.pid}/cmdline`, { encoding: 'utf8' });

    const cmdline = cmdlineAsString.split('\u0000');
    if (cmdline.length > 0) {
      name = cmdline[0];
    }
    // There will be one extra (empty) argument in the end due to the
    // trailing \u0000. We are not interested in this one.
    // This behavior is document in `man proc`.
    if (cmdline.length > 2) {
      args = cmdline.slice(1, cmdline.length - 1);
    } else {
      args = [];
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn('cmdline could not be retrieved via proc file. Reason: %s', err.message);
    }
  }

  return {
    name,
    args
  };
};
