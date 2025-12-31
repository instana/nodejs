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
