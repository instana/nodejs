/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

exports.payloadPrefix = 'startTime';
exports.currentPayload = Date.now() - process.uptime() * 1000;
