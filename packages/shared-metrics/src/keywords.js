/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

/**
 * @param {import('@instana/core/src/config').InstanaConfig} config
 */
exports.init = function init(config) {};

exports.payloadPrefix = 'keywords';
/** @type {Array.<string>} */
// @ts-ignore
exports.currentPayload = [];

// @ts-ignore
exports.activate = function activate(config, packageJsonObj) {
  if (!packageJsonObj || !packageJsonObj.file) {
    return;
  }

  if (packageJsonObj.file.keywords) {
    // @ts-ignore
    exports.currentPayload = packageJsonObj.file.keywords;
  }
};
