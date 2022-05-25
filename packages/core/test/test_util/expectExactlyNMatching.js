/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { findAllMatchingItems, reportFailure } = require('./matchingItems');
const stringifyItems = require('./stringifyItems');

module.exports = function expectExactlyNMatching(items, n, expectations) {
  const matchResult = findAllMatchingItems(items, expectations);
  const matches = matchResult.getMatches();

  if (matches.length === n) {
    return matches;
  } else if (matches.length === 0 && matchResult.getError()) {
    reportFailure(matchResult, `exactly ${n} matching item`);
  } else if (matches.length !== n) {
    throw new Error(
      `Found ${matches.length} matching items, but expected exactly ${n}: All matching items:\n${stringifyItems(
        matches
      )} `
    );
  } else if (matchResult.getError()) {
    reportFailure(matchResult, `exactly ${n} matching item(s)`);
  } else {
    throw new Error(
      'Invalid state in expectExactlyNMatching. Neither correct nor wrong number of matches and no error.'
    );
  }
};
