/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

/**
 * @template T
 * @param {Array.<T>} arr
 * @returns {() => T}
 */
exports.getCircularList = function getCircularList(arr) {
  let currentIndex = 0;
  return function getNextItemFromList() {
    const len = arr.length;
    return arr[currentIndex++ % len];
  };
};
