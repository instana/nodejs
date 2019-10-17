'use strict';

const { util: coreUtil } = require('@instana/core');

const logger = require('../../util/console_logger');
const rootDir = require('./rootDir');

exports.payloadPrefix = 'npmPackageName';
exports.currentPayload = undefined;

exports.activate = function activate() {
  coreUtil.applicationUnderMonitoring.getMainPackageJson(rootDir.root, (err, pckg) => {
    if (err) {
      logger.warn('Failed to determine main package json. Reason: ', err.message, err.stack);
    }

    if (!err && pckg) {
      exports.currentPayload = pckg.name;
    }
  });
};
