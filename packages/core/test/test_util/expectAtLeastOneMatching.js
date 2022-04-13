/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { findAllMatchingItems, reportFailure } = require('./matchingItems');

/**
 * @typedef {import('../../src/tracing/cls').InstanaBaseSpan} InstanaBaseSpan
 */

/**
 * @type {Function}
 * @param {Array.<InstanaBaseSpan>} items
 * @param {(span: InstanaBaseSpan) => void} expectations
 * @param {*} options
 * @returns {*}
 */
module.exports = exports = function expectAtLeastOneMatching(items, expectations, options = { numberOfMatches: null }) {
  const matchResult = findAllMatchingItems(items, expectations);
  const matches = matchResult.getMatches();

  if (options.numberOfMatches && options.numberOfMatches === matches.length) {
    return matches;
  } else if (options.numberOfMatches === null && matches.length >= 1) {
    return matches[0];
  } else if (matchResult.getError()) {
    reportFailure(matchResult, 'at least one matching item');
  } else {
    throw new Error('Invalid state in expectAtLeastOneMatching: There were no matches but also no error');
  }
};
