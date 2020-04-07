'use strict';

const config = require('../config');
const delay = require('./delay');

module.exports = exports = function retry(fn, time, until) {
  if (time == null) {
    time = config.getTestTimeout() / 2;
  }

  if (until == null) {
    until = Date.now() + time;
  }

  if (Date.now() > until) {
    return fn();
  }

  return delay(time / 20)
    .then(fn)
    .catch(() => retry(fn, time, until));
};
