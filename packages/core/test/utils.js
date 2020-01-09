/* eslint-disable consistent-return */

'use strict';

const Promise = require('bluebird');
const fail = require('chai').assert.fail;

const config = require('./config');

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
    throw new Error(
      `Could not find an item which matches all the criteria. Got ${arr.length} items. Last error: ${
        error.message
      }. All Items:\n${JSON.stringify(arr, null, 2)}. Error stack trace: ${error.stack}`
    );
  }
};

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
