/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const requireHook = require('../../../../../util/requireHook');
const constants = require('../../../../constants');

/**
 * This module currently does _not_ instrument the aws-sdk. It only adds the Instana tracing headers to the list of
 * headers that should be ignored when signing requests
 * (see https://docs.aws.amazon.com/general/latest/gr/signing_aws_api_requests.html).
 */
exports.init = function init() {
  requireHook.onFileLoad(/\/aws-sdk\/lib\/signers\/v4.js/, addInstanaHeadersToUnsignableHeaders);
};

function addInstanaHeadersToUnsignableHeaders(v4SignerModule) {
  // This only helps with the v4 signer. There are other signers (v2, v3, ...) which do not expose the list. Therefore
  // we have an additional check in ../protocols/httpClient to skip adding headers if the Authorization header indicates
  // that this is a signed AWS API request.
  if (v4SignerModule && v4SignerModule.prototype && Array.isArray(v4SignerModule.prototype.unsignableHeaders)) {
    v4SignerModule.prototype.unsignableHeaders.push(constants.spanIdHeaderNameLowerCase);
    v4SignerModule.prototype.unsignableHeaders.push(constants.traceIdHeaderNameLowerCase);
    v4SignerModule.prototype.unsignableHeaders.push(constants.traceLevelHeaderNameLowerCase);
  }
}

exports.activate = function activate() {
  // no-op
};

exports.deactivate = function deactivate() {
  // no-op
};
