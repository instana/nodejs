/* eslint-disable consistent-return */

'use strict';

var Promise = require('bluebird');

var config = require('./config');

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
    .catch(function() {
      return retry(fn, time, until);
    });
};

exports.expectOneMatching = function expectOneMatching(arr, fn) {
  if (!arr || arr.length === 0) {
    throw new Error('Could not find an item which matches all the criteria. Got 0 items.');
  }

  var error;

  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];

    try {
      fn(item);
      return item;
    } catch (e) {
      error = e;
    }
  }

  if (error) {
    throw new Error(
      'Could not find an item which matches all the criteria. Got ' +
        arr.length +
        ' items. Last error: ' +
        error.message +
        '. All Items:\n' +
        JSON.stringify(arr, 0, 2) +
        '. Error stack trace: ' +
        error.stack
    );
  }
};

exports.getSpansByName = function getSpansByName(arr, name) {
  var result = [];

  if (!arr || arr.length === 0) {
    return result;
  }

  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];
    if (item.n === name) {
      result.push(item);
    }
  }
  return result;
};
