/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const uniq = require('./uniq');

/**
 * @typedef {Object} SlidingWindowOptions
 * @property {number} [duration]
 */

/**
 * @param {SlidingWindowOptions} opts
 */
exports.create = function createSlidingWindow(opts) {
  const duration = opts.duration;

  /** @type {Array<*>} */
  let values = [];

  return {
    addPoint,
    reduce,
    sum,
    clear,
    getValues,
    getUniqueValues: getUnqiueValues,
    getPercentiles
  };

  /**
   * @param {*} v
   */
  function addPoint(v) {
    values.push([Date.now(), v]);
    values = removeOldPoints(values, duration);
  }

  /**
   * @param {Function} reducer
   * @param {*} initial
   */
  function reduce(reducer, initial) {
    cleanup();
    return values.reduce((prev, curr) => reducer(prev, curr[1]), initial);
  }

  function sum() {
    cleanup();
    let localSum = 0;
    for (let i = 0, len = values.length; i < len; i++) {
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
    const valuesCopy = [];

    for (let i = 0, len = values.length; i < len; i++) {
      valuesCopy[i] = values[i][1];
    }

    return valuesCopy;
  }

  /**
   * @param {Array<number>} percentiles
   */
  function getPercentiles(percentiles) {
    cleanup();

    const sortedValues = getValues();
    const sortedValuesLength = sortedValues.length;
    sortedValues.sort();

    const result = [];

    for (let i = 0, len = percentiles.length; i < len; i++) {
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

/**
 * @param {Array<*>} values
 * @param {number} duration
 */
function removeOldPoints(values, duration) {
  let itemsToRemove = 0;
  const threshold = Date.now() - duration;

  for (let i = 0, len = values.length; i < len; i++) {
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
