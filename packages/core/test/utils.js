/* eslint-disable consistent-return */

'use strict';

const Promise = require('bluebird');
const fail = require('chai').assert.fail;

const config = require('./config');

const MAX_SPANS_IN_ERROR = 30;

exports.retry = function retry(fn, time, until) {
  if (time == null) {
    time = config.getTestTimeout() / 2;
  }

  if (until == null) {
    until = Date.now() + time;
  }

  if (Date.now() > until) {
    return fn();
  }

  return Promise.delay(time / 20)
    .then(fn)
    .catch(() => retry(fn, time, until));
};

exports.expectOneMatching = function expectOneMatching(arr, fn) {
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
      }. All Items:\n${exports.stringifyItems(arr)}. Error stack trace: ${stack}`
    );
  }
};

exports.expectExactlyOneMatching = function expectExactlyOneMatching(arr, fn) {
  if (!arr || arr.length === 0) {
    fail('Could not find excactly one item which matches all the criteria. Got 0 items.');
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

  if (matches.length === 1) {
    return matches[0];
  } else if (matches.length > 1) {
    throw new Error(
      `Found too many matching items, expected one but found ${
        matches.length
      }: All matching items:\n${exports.stringifyItems(matches)} `
    );
  } else if (error) {
    // Clone the stack before creating a new error object, otherwise the stack of the new error object (including the
    // stringified spans) will be added again, basically duplicating the list of spans we add to the error message.
    const stack = Object.assign('', error.stack);
    throw new Error(
      `Could not find an item which matches all the criteria. Got ${arr.length} items. Last error: ${
        error.message
      }. All Items:\n${exports.stringifyItems(arr)}. Error stack trace: ${stack}`
    );
  } else {
    throw new Error('Invalid state in expectExactlyOneMatching: There was no match but also no error');
  }
};

exports.retryUntilSpansMatch = function retryUntilSpansMatch(agentControls, fn) {
  return exports.retry(() => agentControls.getSpans().then(spans => fn(spans)));
};

exports.stringifyItems = function stringifyItems(items) {
  if (items === null) {
    return 'null';
  } else if (items === undefined) {
    return 'undefined';
  } else if (!items) {
    return JSON.stringify(items);
  } else if (Array.isArray(items)) {
    const shortenedSpans = items.map(shortenStackTrace);
    if (shortenedSpans.length > MAX_SPANS_IN_ERROR) {
      return `!! Only listing the first ${MAX_SPANS_IN_ERROR} of ${items.length} total items: ${JSON.stringify(
        shortenedSpans.slice(0, MAX_SPANS_IN_ERROR),
        null,
        2
      )}`;
    }
    return JSON.stringify(shortenedSpans, null, 2);
  } else {
    return JSON.stringify(shortenStackTrace(items), null, 2);
  }
};

function shortenStackTrace(item) {
  if (!item.stack) {
    return item;
  }
  const clone = Object.assign({}, item);
  clone.stack = '<redacted for readability in mocha output>';
  return clone;
}

exports.getSpansByName = function getSpansByName(arr, name) {
  if (!Array.isArray(arr)) {
    throw new Error('Need an array of spans, but got ' + arr);
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
