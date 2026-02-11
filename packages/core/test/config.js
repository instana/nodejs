/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const isCI = require('./test_util/is_ci');

exports.getAppStdio = () => {
  if (process.env.WITH_STDOUT || isCI()) {
    return [process.stdin, process.stdout, process.stderr, 'ipc'];
  }
  return [process.stdin, 'ignore', process.stderr, 'ipc'];
};

exports.getTestTimeout = () => {
  if (isCI()) {
    return 120 * 1000;
  }
  // NOTE: Otherwise mocha will interrupt the debugging session quickly.
  if (process.env.VSCODE_DEBUG === 'true') {
    return 120 * 1000;
  }

  return 4 * 5000;
};

exports.getNPMInstallTimeout = () => {
  return 30 * 1000;
};

// The retry needs to end before the mocha timeout!
// Otherwise we won't see the error message.
exports.getRetryTimeout = () => {
  if (isCI()) {
    return 100 * 1000;
  }
  // NOTE: Otherwise mocha will interrupt the debugging session quickly.
  if (process.env.VSCODE_DEBUG === 'true') {
    return 100 * 1000;
  }

  return 8000;
};
