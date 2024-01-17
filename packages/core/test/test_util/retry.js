/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const config = require('../config');
const delay = require('./delay');

module.exports = function retry(fn, time, until) {
  if (time == null) {
    time = config.getTestTimeout();
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
