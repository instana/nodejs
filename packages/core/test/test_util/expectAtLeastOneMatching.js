'use strict';

const fail = require('chai').assert.fail;

const stringifyItems = require('./stringifyItems');

module.exports = exports = function expectAtLeastOneMatching(arr, fn) {
  if (!arr || arr.length === 0) {
    fail('Could not find an item which matches all the criteria. Got 0 items.');
  }

  let error;

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];

    try {
      fn(item);
      return item;
    } catch (e) {
      error = e;
    }
  }

  if (error) {
    // Clone the stack before creating a new error object, otherwise the stack of the new error object (including the
    // stringified spans) will be added again, basically duplicating the list of spans we add to the error message.
    const stack = Object.assign('', error.stack);
    throw new Error(
      `Could not find an item which matches all the criteria. Got ${arr.length} items. Last error: ${
        error.message
      }. All Items:\n${stringifyItems(arr)}. Error stack trace: ${stack}`
    );
  }
};
