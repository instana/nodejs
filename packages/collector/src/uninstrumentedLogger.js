/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * CASE 1: We use our internal pino logger as the Instana logger. The logs are automatically not traced because
 *         this file is loaded before the pino instrumentation is applied.
 *
 * CASE 2: Customer sets custom pino logger. Works out of the box because we create our own uninstrumented pino logger
 *         instances as a child logger because of unsupported multistreams for child loggers (see logger.js line 155).
 *
 * CASE 3: Customer sets non pino logger. The target instrumentations protect tracing internal logs with __instana.
 */
const pino = require('pino').default;
module.exports = pino;
