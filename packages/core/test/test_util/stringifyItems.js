/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const MAX_SPANS_IN_ERROR = 30;

module.exports = exports = function stringifyItems(items) {
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
