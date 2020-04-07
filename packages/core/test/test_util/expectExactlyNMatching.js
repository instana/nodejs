'use strict';

const fail = require('chai').assert.fail;

const stringifyItems = require('./stringifyItems');

module.exports = exports = function expectExactlyNMatching(arr, n, fn) {
  if (!arr || arr.length === 0) {
    fail(`Could not find excactly ${n} item(s) which matched all the criteria. Got 0 items.`);
  }

  const matches = [];
  let error;

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];

    try {
      fn(item);
      matches.push(item);
    } catch (e) {
      error = e;
    }
  }

  if (matches.length === n) {
    return matches;
  } else if (matches.length !== n) {
    throw new Error(
      `Found ${matches.length} matching items, but expected exactly ${n}: All matching items:\n${stringifyItems(
        matches
      )} `
    );
  } else if (error) {
    // Clone the stack before creating a new error object, otherwise the stack of the new error object (including the
    // stringified spans) will be added again, basically duplicating the list of spans we add to the error message.
    const stack = Object.assign('', error.stack);
    throw new Error(
      `Could not find exactly ${n} matches. Last error: ${error.message}. All Items:\n${stringifyItems(
        arr
      )}. Error stack trace: ${stack}`
    );
  } else {
    throw new Error('Invalid state in expectExactlyNMatching.');
  }
};
