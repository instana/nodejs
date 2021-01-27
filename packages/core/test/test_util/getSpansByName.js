/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

module.exports = exports = function getSpansByName(arr, name) {
  if (!Array.isArray(arr)) {
    throw new Error(`Need an array of spans, but got ${arr}`);
  }
  const result = [];

  if (!arr || arr.length === 0) {
    return result;
  }

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item.n === name) {
      result.push(item);
    }
  }
  return result;
};
