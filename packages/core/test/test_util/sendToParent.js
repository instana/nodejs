/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

module.exports = exports = function sendToParent(message) {
  if (process.send) {
    process.send(message);
  }
};
