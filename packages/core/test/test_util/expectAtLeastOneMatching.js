/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { findAllMatchingItems, reportFailure } = require('./matchingItems');

module.exports = exports = function expectAtLeastOneMatching(items, expectations) {
  const matchResult = findAllMatchingItems(items, expectations);
  const matches = matchResult.getMatches();

  if (matches.length >= 1) {
    return matches[0];
  } else if (matchResult.getError()) {
    reportFailure(matchResult, 'at least one matching item');
  } else {
    throw new Error('Invalid state in expectAtLeastOneMatching: There were no matches but also no error');
  }
};
