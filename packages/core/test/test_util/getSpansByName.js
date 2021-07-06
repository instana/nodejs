/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

/**
 * @typedef {import('../../src/tracing/cls').InstanaBaseSpan} InstanaBaseSpan
 */

/**
 * @param {Array.<InstanaBaseSpan>} arr
 * @param {string} name
 * @returns {Array.<InstanaBaseSpan>}
 */
module.exports = function getSpansByName(arr, name) {
  if (!Array.isArray(arr)) {
    throw new Error(`Need an array of spans, but got ${arr}`);
  }
  /** @type {Array.<InstanaBaseSpan>} */
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
