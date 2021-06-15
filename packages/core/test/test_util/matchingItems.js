/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const fail = require('chai').assert.fail;

const stringifyItems = require('./stringifyItems');

/**
 * @typedef {import('../../src/tracing/cls').InstanaBaseSpan} InstanaBaseSpan
 */

class MatchResult {
  /**
   * @param {Array.<InstanaBaseSpan>} items
   * @param {Array.<(span: InstanaBaseSpan) => void> | ((span: InstanaBaseSpan) => void)} expectations
   */
  constructor(items, expectations) {
    if (!Array.isArray(items)) {
      throw new Error(`items needs to be an array: ${items}`);
    }
    if (!Array.isArray(expectations) && typeof expectations !== 'function') {
      throw new Error(`expectations needs to be an array of functions or a function: ${expectations}`);
    }
    this.items = items;
    this.expectations = expectations;
    /** @type {Array.<InstanaBaseSpan>} */
    this.matches = [];
    this.saveBestMatch = Array.isArray(expectations);
    this.bestMatchPassed = 0;
  }

  getItems() {
    return this.items;
  }

  getExpectations() {
    return this.expectations;
  }

  getMatches() {
    return this.matches;
  }

  /**
   * @param {InstanaBaseSpan} item
   */
  addMatch(item) {
    this.matches.push(item);
  }

  getError() {
    return this.error;
  }

  /**
   * @param {*} error
   */
  setError(error) {
    this.error = error;
  }

  isSaveBestMatch() {
    return this.saveBestMatch;
  }

  getBestMatch() {
    return this.bestMatch;
  }

  /**
   * @param {InstanaBaseSpan} bestMatch
   */
  setBestMatch(bestMatch) {
    this.bestMatch = bestMatch;
  }

  getBestMatchPassed() {
    return this.bestMatchPassed;
  }

  /**
   * @param {number} bestMatchPassed
   */
  setBestMatchPassed(bestMatchPassed) {
    this.bestMatchPassed = bestMatchPassed;
  }

  getFailedExpectation() {
    return this.failedExpectation;
  }

  /**
   * @param {(span: InstanaBaseSpan) => void} failedExpectation
   */
  setFailedExpectation(failedExpectation) {
    this.failedExpectation = failedExpectation;
  }
}

exports.MatchResult = MatchResult;

/**
 *
 * @param {Array.<import('../../src/tracing/cls').InstanaBaseSpan>} items
 * @param {Array.<(span: InstanaBaseSpan) => void> | ((span: InstanaBaseSpan) => void)} expectations
 * @returns {MatchResult}
 */
exports.findAllMatchingItems = function findAllMatchingItems(items, expectations) {
  if (!items || items.length === 0) {
    fail('Could not find any matching items which match all the criteria. In fact, there were zero items.');
  }

  const result = new MatchResult(items, expectations);

  let mostRecentExpectation = null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let passed;

    try {
      if (Array.isArray(expectations)) {
        // More recent tests pass an array of functions with individual expectations. This is preferable over the legacy
        // API because it provides much better output in case of a failure. This is of particularly crucial for the
        // occasional flaky test on CI.
        for (passed = 0; passed < expectations.length; passed++) {
          mostRecentExpectation = expectations[passed];
          expectations[passed](item);
        }
      } else if (typeof expectations === 'function') {
        // Legacy tests just pass one big function which executes all expectations.
        expectations(item);
      }
      result.addMatch(item);
    } catch (error) {
      if (result.isSaveBestMatch()) {
        if (passed >= result.getBestMatchPassed()) {
          result.setBestMatch(item);
          result.setBestMatchPassed(passed);
          result.setFailedExpectation(mostRecentExpectation);
          result.setError(error);
        }
      } else {
        result.setError(error);
      }
    }
  }
  return result;
};

/**
 * @param {MatchResult} result
 * @param {*} lookingFor
 */
exports.reportFailure = function reportFailure(result, lookingFor) {
  // Clone the stack before creating a new error object, otherwise the stack of the new error object (including the
  // stringified spans) will be added again, basically duplicating the list of spans we add to the error message.
  const stack = Object.assign('', result.error.stack);
  let errorMessageReported = false;
  let message = `Could not find the required matching items while looking for ${lookingFor}.\n----\n`;
  if (result.isSaveBestMatch() && result.getBestMatch()) {
    message += `Best matching item:\n${stringifyItems(result.getBestMatch())}\n`;
    message += `This item passed the first ${result.getBestMatchPassed()} (of ${
      result.getExpectations().length
    }) expectations.\n`;
    if (result.getFailedExpectation()) {
      message += `This expectation failed: ${result.getFailedExpectation().toString()}\n`;
      message += `And it failed with this error: ${result.getError().message}\n`;
      errorMessageReported = true;
    }
    message += '----\nMore details:\n';
  }
  message += `Got ${result.getItems().length} items in total.\n`;
  if (!process.env.OMIT_ITEM_LIST_ON_MATCH_FAILURE) {
    message += `All Items:\n${stringifyItems(result.getItems())}\n`;
  }
  if (!errorMessageReported) {
    message += `Last error: ${result.getError().message}\n`;
  }
  message += `Error stack trace:\n${stack}`;
  throw new Error(message);
};
