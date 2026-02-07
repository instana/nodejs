/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { processJob } = require('./util');

const logPrefix = `Bull worker child process (${process.pid}):\t`;

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix}${args[0]}`;
  console.log.apply(console, args);
  /* eslint-enable no-console */
}

module.exports = (job, done) => processJob(job, done, log, 'separate process');
