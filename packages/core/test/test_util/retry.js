/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const config = require('../config');
const delay = require('./delay');

module.exports = function retry(fn, time, until) {
  // retry every second by default
  if (time == null) {
    time = 500;
  }

  if (until == null) {
    until = Date.now() + config.getTestTimeout() * 2;
  }

  if (Date.now() > until) {
    return fn();
  }

  return delay(time / 20)
    .then(() => {
      try {
        return fn();
      } catch (err) {
        return retry(fn, time, until);
      }
    })
    .catch(() => retry(fn, time, until));
};
