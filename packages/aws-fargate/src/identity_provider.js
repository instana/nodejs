/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

let taskArn;
let containerId;

exports.init = function init(_taskArn, _containerId) {
  taskArn = _taskArn;
  containerId = _containerId;
};

exports.getHostHeader = function getHostHeader() {
  return taskArn;
};

exports.getFrom = function getFrom() {
  return {
    hl: true,
    cp: 'aws',
    e: containerId
  };
};
