/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

const { util: coreUtil } = require('@instana/core');
const { consoleLogger: logger } = require('@instana/serverless');

const rootDir = require('./rootDir');

exports.payloadPrefix = 'npmPackageDescription';
exports.currentPayload = undefined;

exports.activate = function activate() {
  coreUtil.applicationUnderMonitoring.getMainPackageJson(rootDir.root, (err, pckg) => {
    if (err) {
      logger.warn('Failed to determine main package json. Reason: ', err.message, err.stack);
    }

    if (!err && pckg) {
      exports.currentPayload = pckg.description;
    }
  });
};
