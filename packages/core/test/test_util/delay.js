/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

/**
 * A simple delay based on native promises.
 */
module.exports = exports = function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};
