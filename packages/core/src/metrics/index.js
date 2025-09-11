/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const fs = require('../uninstrumentedFs');
const path = require('path');

/** @typedef {import('../config/normalizeConfig').InstanaConfig} InstanaConfig */

/** @type {InstanaConfig} */
let config;

/**
 * @param {InstanaConfig} _config
 */
exports.init = _config => {
  config = _config;
};

/**
 * Depending on what kind of data the metric or snapshot attributes represents, a number of different payloads are
 * valid. Ultimately, it depends on what the backend understands.
 * @typedef {string|Object.<string, any>|Array.<string>} SnapshotOrMetricsPayload
 */

/**
 * @typedef {Object} InstanaMetricsModule
 * @property {string} payloadPrefix
 * @property {SnapshotOrMetricsPayload} currentPayload
 * @property {(config?: InstanaConfig) => void} [activate]
 * @property {() => void} [deactivate]
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
          // TODO: move the extra metrics into a separate folder
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
 * @returns {Object.<string, SnapshotOrMetricsPayload>}
 */
exports.gatherData = function gatherData() {
  /** @type {Object.<string, SnapshotOrMetricsPayload>} */
  const payload = {};

  metricsModules.forEach(metricsModule => {
    payload[metricsModule.payloadPrefix] = metricsModule.currentPayload;
  });

  return payload;
};

// TODO: Remove in next major release
exports.setLogger = () => {};
