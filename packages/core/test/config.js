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
    return 30000;
  }
  // NOTE: Otherwise mocha will interrupt the debugging session quickly.
  if (process.env.VSCODE_DEBUG === 'true') {
    return 30000;
  }
  return 10 * 1000;
};
