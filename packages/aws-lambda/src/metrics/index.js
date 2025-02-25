/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { metrics: coreMetrics } = require('@instana/core');
const npmPackageName = require('./npmPackageName');
const npmPackageVersion = require('./npmPackageVersion');
const npmPackageDescription = require('./npmPackageDescription');

exports.init = function init(config) {
  coreMetrics.init(config);
  npmPackageName.init(config);
  npmPackageVersion.init(config);
  npmPackageDescription.init(config);

  coreMetrics.registerAdditionalMetrics([npmPackageName, npmPackageVersion, npmPackageDescription]);
};

exports.activate = function activate() {
  coreMetrics.activate();
};

exports.deactivate = function deactivate() {
  coreMetrics.deactivate();
};

exports.gatherData = function gatherData() {
  return coreMetrics.gatherData();
};
