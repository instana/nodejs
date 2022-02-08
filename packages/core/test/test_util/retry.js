/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const config = require('../config');
const delay = require('./delay');

/**
 * @param {(value: *) => *} fn
 * @param {number} [time]
 * @param {number} [until]
 * @returns {Function | Promise<*>}
 */
module.exports = function retry(fn, time, until) {
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
    .catch(err => {
      if (err.name === 'AssertionError') {
        throw err;
      }

      retry(fn, time, until);
    });
};
