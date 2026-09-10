/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

/**
 * Valid modes for stack trace configuration
 * @type {string[]}
 */
exports.validStackTraceModes = ['error', 'all', 'none'];
exports.MAX_STACK_TRACE_LENGTH = 500;
exports.DEFAULT_STACK_TRACE_LENGTH = 10;
exports.DEFAULT_STACK_TRACE_MODE = 'all';
exports.STACK_TRACE_MODES = {
  ERROR: 'error',
  ALL: 'all',
  NONE: 'none'
};

exports.CONFIG_SOURCES = {
  ENV: 1,
  INCODE: 2,
  AGENT: 3,
  DEFAULT: 4
};

exports.LOG_LEVEL = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
  OFF: 'off'
};

exports.LOG_LEVEL_PRIORITY = {
  [exports.LOG_LEVEL.TRACE]: 10,
  [exports.LOG_LEVEL.DEBUG]: 20,
  [exports.LOG_LEVEL.INFO]: 30,
  [exports.LOG_LEVEL.WARN]: 40,
  [exports.LOG_LEVEL.ERROR]: 50,
  [exports.LOG_LEVEL.FATAL]: 60
};

exports.DEFAULT_LOG_LEVEL = exports.LOG_LEVEL.WARN;

// Allowed poll rate values in milliseconds, matching the agent's supported poll_rate seconds:
// [1, 5, 10, 20, 30, 60]
exports.allowedTransmissionDelayValues = [1000, 5000, 10000, 20000, 30000, 60000];
