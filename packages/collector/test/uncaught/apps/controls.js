/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const spawnSync = require('child_process').spawnSync;
const path = require('path');

exports.order = function () {
  return spawnProcess('order.js');
};

exports.rethrow = function () {
  return spawnProcess('rethrow.js');
};

exports.rethrowWhenOtherHandlersArePresent = function () {
  return spawnProcess('rethrowWhenOtherHandlersArePresent.js');
};

exports.asyncInHandler = function () {
  return spawnProcess('asyncInHandler.js');
};

exports.asyncRethrowWhenOtherHandlersArePresent = function () {
  return spawnProcess('asyncRethrowWhenOtherHandlersArePresent.js');
};

function spawnProcess(fileName) {
  const appPath = path.join(__dirname, fileName);
  return spawnSync('node', [appPath], {
    timeout: 1000
  });
}
