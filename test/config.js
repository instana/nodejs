'use strict';

exports.acceptorPort = 8443;

exports.acceptorBaseUrl = `https://localhost:${exports.acceptorPort}`;

exports.instanaKey = 'dummy-key';

exports.getAppStdio = function() {
  if (process.env.WITH_STDOUT || process.env.CI) {
    return [process.stdin, process.stdout, process.stderr, 'ipc'];
  }
  return [process.stdin, 'ignore', process.stderr, 'ipc'];
};

exports.getTestTimeout = function() {
  if (process.env.CI) {
    return 30000;
  }
  return 5000;
};
