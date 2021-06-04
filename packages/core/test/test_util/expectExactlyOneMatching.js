/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { findAllMatchingItems, reportFailure } = require('./matchingItems');
const stringifyItems = require('./stringifyItems');

/**
 * @typedef {import('../../src/tracing/cls').InstanaBaseSpan} InstanaBaseSpan
 */

/**
 * @type {Function}
 * @param {Array.<InstanaBaseSpan>} items
 * @param {(span: InstanaBaseSpan) => void} expectations
 * @returns {InstanaBaseSpan}
 */
module.exports = exports = function expectExactlyOneMatching(items, expectations) {
  const matchResult = findAllMatchingItems(items, expectations);
  const matches = matchResult.getMatches();

  if (matches.length === 1) {
    return matches[0];
  } else if (matches.length > 1) {
    throw new Error(
      `Found too many matching items, expected exactly one but found ${
        matches.length
      }: All matching items:\n${stringifyItems(matches)} `
    );
  } else if (matchResult.getError()) {
    reportFailure(matchResult, 'exactly one matching item');
  } else {
    throw new Error('Invalid state in expectExactlyOneMatching: There was no match but also no error');
  }
};
