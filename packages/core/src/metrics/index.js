'use strict';

var fs = require('fs');
var path = require('path');

var config;

exports.init = function(_config) {
  config = _config;
};

exports.findAndRequire = function findAndRequire(baseDir) {
  return fs
    .readdirSync(baseDir)
    .filter(function(moduleName) {
      // ignore non-JS files and non-metric modules
      return (
        moduleName.indexOf('.js') === moduleName.length - 3 &&
        moduleName.indexOf('index.js') < 0 &&
        moduleName.indexOf('transmissionCycle.js') < 0
      );
    })
    .map(function(moduleName) {
      return require(path.join(baseDir, moduleName));
    });
};

var metricsModules = exports.findAndRequire(__dirname);

exports.registerAdditionalMetrics = function registerAdditionalMetrics(additionalMetricsModules) {
  metricsModules = metricsModules.concat(additionalMetricsModules);
};

exports.activate = function() {
  metricsModules.forEach(function(metricsModule) {
    if (metricsModule.activate) {
      metricsModule.activate(config);
    }
  });
};

exports.deactivate = function() {
  metricsModules.forEach(function(metricsModule) {
    if (metricsModule.deactivate) {
      metricsModule.deactivate();
    }
  });
};

exports.gatherData = function gatherData() {
  var payload = {};

  metricsModules.forEach(function(metricsModule) {
    payload[metricsModule.payloadPrefix] = metricsModule.currentPayload;
  });

  return payload;
};

exports.setLogger = function setLogger(logger) {
  metricsModules.forEach(function(metricModule) {
    if (typeof metricModule.setLogger === 'function') {
      metricModule.setLogger(logger);
    }
  });
};
