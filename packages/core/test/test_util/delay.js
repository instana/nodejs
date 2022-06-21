/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

module.exports = function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};
