/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { isCI } = require('@instana/core/test/test_util');

exports.getAppStdio = function getAppStdio() {
  if (process.env.WITH_STDOUT || isCI()) {
    return [process.stdin, process.stdout, process.stderr, 'ipc'];
  }
  return [process.stdin, 'ignore', process.stderr, 'ipc'];
};

exports.getTestTimeout = function getTestTimeout() {
  if (isCI()) {
    return 30000;
  }
  return 5000;
};
