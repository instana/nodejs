/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */
// @ts-nocheck

'use strict';

const fs = require('fs');
const path = require('path');

let config;

exports.init = _config => {
  config = _config;
};

exports.findAndRequire = function findAndRequire(baseDir) {
  return (
    fs
      .readdirSync(baseDir)
      // ignore non-JS files and non-metric modules
      .filter(
        moduleName =>
          moduleName.indexOf('.js') === moduleName.length - 3 &&
          moduleName.indexOf('index.js') < 0 &&
          moduleName.indexOf('transmissionCycle.js') < 0
      )
      .map(moduleName => require(path.join(baseDir, moduleName)))
  );
};

let metricsModules = exports.findAndRequire(__dirname);

exports.registerAdditionalMetrics = function registerAdditionalMetrics(additionalMetricsModules) {
  metricsModules = metricsModules.concat(additionalMetricsModules);
};

exports.activate = () => {
  metricsModules.forEach(metricsModule => {
    if (metricsModule.activate) {
      metricsModule.activate(config);
    }
  });
};

exports.deactivate = () => {
  metricsModules.forEach(metricsModule => {
    if (metricsModule.deactivate) {
      metricsModule.deactivate();
    }
  });
};

exports.gatherData = function gatherData() {
  const payload = {};

  metricsModules.forEach(metricsModule => {
    payload[metricsModule.payloadPrefix] = metricsModule.currentPayload;
  });

  return payload;
};

exports.setLogger = function setLogger(logger) {
  metricsModules.forEach(metricModule => {
    if (typeof metricModule.setLogger === 'function') {
      metricModule.setLogger(logger);
    }
  });
};
