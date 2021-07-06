/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/**
 * @param {*} message
 */
module.exports = function sendToParent(message) {
  if (process.send) {
    process.send(message);
  }
};
