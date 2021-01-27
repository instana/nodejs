/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const W3cTraceContext = require('./W3cTraceContext');

module.exports = exports = W3cTraceContext.fromInstanaIds;

exports.createEmptyUnsampled = W3cTraceContext.createEmptyUnsampled;
