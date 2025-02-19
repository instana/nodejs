/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { util: coreUtil } = require('@instana/core');
const rootDir = require('./rootDir');

exports.payloadPrefix = 'npmPackageDescription';
exports.currentPayload = undefined;

let logger;

exports.init = config => {
  logger = config.logger;
};

exports.activate = function activate() {
  coreUtil.applicationUnderMonitoring.getMainPackageJsonStartingAtDirectory(rootDir.root, (err, pckg) => {
    if (err) {
      logger.warn(`Failed to determine main package json. Reason: ${err?.message} ${err?.stack}`);
    }

    if (!err && pckg) {
      exports.currentPayload = pckg.description;
    }
  });
};
