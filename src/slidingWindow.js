'use strict';

var uniq = require('./uniq');

exports.create = function createSlidingWindow(opts) {
  var duration = opts.duration;

  var values = [];

  return {
    addPoint: addPoint,
    reduce: reduce,
    sum: sum,
    clear: clear,
    getValues: getValues,
    getUniqueValues: getUnqiueValues,
    getPercentiles: getPercentiles
  };

  function addPoint(v) {
    values.push([Date.now(), v]);
    values = removeOldPoints(values, duration);
  }

  function reduce(reducer, initial) {
    cleanup();
    return values.reduce(function(prev, curr) {
      return reducer(prev, curr[1]);
    }, initial);
  }

  function sum() {
    cleanup();
    var localSum = 0;
    for (var i = 0, len = values.length; i < len; i++) {
      localSum += values[i][1];
    }
    return localSum;
  }

  function clear() {
    values = [];
  }

  function cleanup() {
    values = removeOldPoints(values, duration);
  }

  function getValues() {
    cleanup();
    var valuesCopy = [];

    for (var i = 0, len = values.length; i < len; i++) {
      valuesCopy[i] = values[i][1];
    }

    return valuesCopy;
  }

  function getPercentiles(percentiles) {
    cleanup();

    var sortedValues = getValues();
    var sortedValuesLength = sortedValues.length;
    sortedValues.sort();

    var result = [];

    for (var i = 0, len = percentiles.length; i < len; i++) {
      if (sortedValuesLength === 0) {
        result[i] = 0;
      } else if (sortedValuesLength === 1) {
        result[i] = sortedValues[0];
      } else {
        result[i] = sortedValues[Math.round(len * percentiles[i])];
      }
    }

    return result;
  }

  function getUnqiueValues() {
    return uniq(getValues());
  }
};

function removeOldPoints(values, duration) {
  var itemsToRemove = 0;
  var threshold = Date.now() - duration;

  for (var i = 0, len = values.length; i < len; i++) {
    if (values[i][0] < threshold) {
      itemsToRemove++;
    } else {
      break;
    }
  }

  if (itemsToRemove === 0) {
    return values;
  }
  return values.slice(itemsToRemove);
}
