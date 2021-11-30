/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

module.exports = exports = function determineGrpcPackageVersionUnderTest() {
  if (process.env.GRPC_PACKAGE_VERSION) {
    return process.env.GRPC_PACKAGE_VERSION;
  } else {
    return '>=1.17.0';
  }
};
