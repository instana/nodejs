/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { processJob } = require('./util');

const logPrefix = `Bull child process (${process.pid}) & parent agent uuid (${process.env.INSTANA_AGENT_UUID}):\t`;

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = `${logPrefix}${args[0]}`;
  console.log.apply(console, args);
  /* eslint-enable no-console */
}

module.exports = (job, done) => processJob(job, done, log, 'separate process');
