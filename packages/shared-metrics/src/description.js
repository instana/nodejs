/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

exports.init = function init() {};

exports.payloadPrefix = 'description';
// @ts-ignore
exports.currentPayload = undefined;

// @ts-ignore
exports.activate = function activate(config, packageJsonObj) {
  if (!packageJsonObj || !packageJsonObj.file) {
    return;
  }

  // @ts-ignore
  exports.currentPayload = packageJsonObj.file.description;
};
