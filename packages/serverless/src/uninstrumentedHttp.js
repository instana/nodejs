/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/**
 * This module is copied from @instana/core/src/uninstrumentedHttp.js to avoid importing a whole package because of one
 * single module.
 */

'use strict';

const http = require('http');
const https = require('https');

/**
 * @typedef {Object} UninstrumentedHTTP
 * @property {import('http') & {agent: import('http').Agent}} http
 * @property {import('https')} https
 */

/** @type {UninstrumentedHTTP} */
module.exports = exports = {
  http: Object.create(http),
  https: Object.create(https)
};

exports.http.get = http.get;
exports.http.request = http.request;
exports.https.request = https.request;
exports.https.get = https.get;

exports.http.agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 5
});
