'use strict';

exports.backendProtocol = 'https';
exports.backendHost = 'localhost';
exports.backendPort = 8443;
exports.backendPath = '/serverless';

exports.backendBaseUrl = `${exports.backendProtocol}://${exports.backendHost}:${exports.backendPort}${
  exports.backendPath
}`;

exports.instanaKey = 'dummy-key';

exports.downstreamDummyProtocol = 'http';
exports.downstreamDummyHost = 'localhost';
exports.downstreamDummyPort = 3456;

exports.downstreamDummyUrl = `${exports.downstreamDummyProtocol}://${exports.downstreamDummyHost}:${
  exports.downstreamDummyPort
}/`;

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
