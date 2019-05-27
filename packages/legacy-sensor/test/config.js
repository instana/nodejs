'use strict';

exports.getAppStdio = () => {
  if (process.env.WITH_STDOUT || process.env.CI) {
    return [process.stdin, process.stdout, process.stderr, 'ipc'];
  }
  return [process.stdin, 'ignore', process.stderr, 'ipc'];
};

exports.getTestTimeout = () => {
  if (process.env.CI) {
    return 30000;
  }
  return 5000;
};
