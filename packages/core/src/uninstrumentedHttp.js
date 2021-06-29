/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
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
exports.https.get = https.get;
exports.https.request = https.request;

exports.http.agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 5
});
