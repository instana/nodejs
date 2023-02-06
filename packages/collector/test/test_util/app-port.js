/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

module.exports = function getAppPort() {
  return process.env.APP_PORT || 3215;
};
