/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AWS = require('aws-sdk');

/**
 * Here we "hack" into AWS SDK to force the User Agent header to be an array, so we can test if our instrumentation of
 * httpClient is properly handling this case. The Node.js outgoing HTTP headers accept string, number or array of
 * strings, which is why we want to test this.
 */
const _appendToUserAgent = AWS.HttpRequest.prototype.appendToUserAgent;
AWS.HttpRequest.prototype.appendToUserAgent = function () {
  _appendToUserAgent.apply(this, arguments);
  this.headers[this.getUserAgentHeaderName()] = [this._userAgent];
};

AWS.config.update({ region: 'us-east-2' });

const sqs = new AWS.SQS();

exports.sqs = sqs;
