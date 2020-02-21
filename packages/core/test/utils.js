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
      }. All Items:\n${exports.stringifySpans(arr)}. Error stack trace: ${stack}`
    );
  }
};

exports.retryUntilSpansMatch = function retryUntilSpansMatch(agentControls, fn) {
  return exports.retry(() => agentControls.getSpans().then(spans => fn(spans)));
};

exports.stringifySpans = function stringifySpans(spans) {
  if (spans === null) {
    return 'null';
  } else if (spans === undefined) {
    return 'undefined';
  } else if (!spans) {
    return JSON.stringify(spans);
  } else if (Array.isArray(spans)) {
    const shortenedSpans = spans.map(shortenStackTrace);
    if (shortenedSpans.length > MAX_SPANS_IN_ERROR) {
      return `!! Only listing the first ${MAX_SPANS_IN_ERROR} of ${spans.length} total spans: ${JSON.stringify(
        shortenedSpans.slice(0, MAX_SPANS_IN_ERROR),
        null,
        2
      )}`;
    }
    return JSON.stringify(shortenedSpans, null, 2);
  } else if (spans.n) {
    return JSON.stringify(shortenStackTrace(spans), null, 2);
  } else {
    return JSON.stringify(spans, null, 2);
  }
};

function shortenStackTrace(span) {
  const clone = Object.assign({}, span);
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
