/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** @typedef {import('../util/normalizeConfig').InstanaConfig} InstanaConfig */

/** @type {InstanaConfig} */
let config;

/**
 * @param {InstanaConfig} _config
 */
exports.init = _config => {
  config = _config;
};

/**
 * @typedef {Object} InstanaMetricsModule
 * @property {string} payloadPrefix
 * @property {string} [currentPayload]
 * @property {(config?: InstanaConfig) => void} [activate]
 * @property {() => void} [deactivate]
 * @property {(logger: import('../logger').GenericLogger) => void} [setLogger]
 */

/**
 * @param {string} baseDir
 * @returns
 */
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

/** @type {Array.<InstanaMetricsModule>} */
let metricsModules = exports.findAndRequire(__dirname);

/**
 * @param {Array.<InstanaMetricsModule>} additionalMetricsModules
 */
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

/**
 * @returns {Object.<string, string>}
 */
exports.gatherData = function gatherData() {
  /** @type {Object.<string, string>} */
  const payload = {};

  metricsModules.forEach(metricsModule => {
    payload[metricsModule.payloadPrefix] = metricsModule.currentPayload;
  });

  return payload;
};

/**
 * @param {import('../logger').GenericLogger} logger
 */
exports.setLogger = function setLogger(logger) {
  metricsModules.forEach(metricModule => {
    if (typeof metricModule.setLogger === 'function') {
      metricModule.setLogger(logger);
    }
  });
};
