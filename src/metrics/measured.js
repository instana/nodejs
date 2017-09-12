'use strict';

var shimmer = require('shimmer');
var requireHook = require('../util/requireHook');

var mesuredLibrary;
var collections = [];
requireHook('measured', onMeasuredDiscovered);

exports.payloadPrefix = 'measured';
Object.defineProperty(exports, 'currentPayload', {
  get: collectMetrics
});

exports.activate = function() {};
exports.deactivate = function() {};

function onMeasuredDiscovered(measured) {
  mesuredLibrary = measured;
  shimmer.wrap(measured, 'Collection', shimCollectionConstructor);
  shimmer.wrap(measured, 'createCollection', shimCreateCollection);
}


function shimCollectionConstructor(original) {
  return function() {
    // TODO is this the correct way of overwriting?
    var newCollection = original.apply(arguments);
    collections.push(newCollection);
    return newCollection;
  };
}


function shimCreateCollection(original) {
  return function() {
    var newCollection = original.apply(arguments);
    collections.push(newCollection);
    return newCollection;
  };
}


function collectMetrics() {
  if (collections.length === 0) {
    return undefined;
  }

  var result = {
    gauges: {},
    counters: {},
    meters: {},
    histograms: {},
    timers: {}
  };

  for (var i = 0, length = collections.length; i < length; i++) {
    var collection = collections[i];
    var metricPrefix = '';
    if (collection.name) {
      metricPrefix = collection.name + '.';
    }

    for (var metricName in collection._metrics) {
      if (collection._metrics.hasOwnProperty(metricName)) {
        var metricKey = metricPrefix + metricName;
        var metric = collection._metrics[metricName];
        collectMetric(result, metricKey, metric);
      }
    }
  }

  return result;
}


function collectMetric(result, metricKey, metric) {
  // TODO detect
}
