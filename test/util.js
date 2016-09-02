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
