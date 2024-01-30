/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const config = require('../config');
const delay = require('./delay');

module.exports = function retry(fn, time, until, tries) {
  if (!tries) {
    tries = 0;
  }

  // retry every 500ms by default
  if (time == null) {
    time = 500;
  }

  if (until == null) {
    until = Date.now() + config.getTestTimeout() * 2;
  }

  if (Date.now() > until) {
    return fn();
  }

  return delay(tries === 0 ? 0 : time)
    .then(() => {
      return fn();
    })
    .catch(() => {
      tries += 1;
      return retry(fn, time, until, tries);
    });
};
