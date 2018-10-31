'use strict';

exports.getAppStdio = function() {
  if (process.env.WITH_STDOUT || process.env.CI) {
    return [process.stdin, process.stdout, process.stderr];
  }
  return [process.stdin, 'ignore', process.stderr];
};

exports.getTestTimeout = function() {
  if (process.env.CI) {
    return 30000;
  }
  return 5000;
};
