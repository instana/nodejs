/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

exports.getAppStdio = function getAppStdio() {
  if (process.env.WITH_STDOUT || process.env.CI) {
    return [process.stdin, process.stdout, process.stderr, 'ipc'];
  }
  return [process.stdin, 'ignore', process.stderr, 'ipc'];
};

exports.getTestTimeout = function getTestTimeout() {
  if (process.env.CI) {
    return 30000;
  }
  return 5000;
};
