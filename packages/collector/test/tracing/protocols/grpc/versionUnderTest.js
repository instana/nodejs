'use strict';

const semver = require('semver');

module.exports = exports = function determineGrpcPackageVersionUnderTest() {
  if (process.env.GRPC_PACKAGE_VERSION) {
    return process.env.GRPC_PACKAGE_VERSION;
  } else if (semver.satisfies(process.versions.node, '^8')) {
    return '=1.10.1';
  } else {
    return '>=1.17.0';
  }
};
