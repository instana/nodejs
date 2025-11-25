/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const core = require('@instana/core');
const npmPackageName = require('./npmPackageName');
const npmPackageVersion = require('./npmPackageVersion');
const npmPackageDescription = require('./npmPackageDescription');

exports.init = function init(config) {
  core.metrics.init(config);
  npmPackageName.init(config);
  npmPackageVersion.init(config);
  npmPackageDescription.init(config);

  core.metrics.registerAdditionalMetrics([npmPackageName, npmPackageVersion, npmPackageDescription]);
};

exports.activate = function activate() {
  core.metrics.activate();
};

exports.deactivate = function deactivate() {
  core.metrics.deactivate();
};

exports.gatherData = function gatherData() {
  return core.metrics.gatherData();
};
