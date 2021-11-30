/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

// This is no longer used as of release 1.110.3, but apparently there are setups where the version of @instana/collector
// and @instana/core do not match, so we need to keep this around for a while for backwards compatibility.

/**
 * @param {string} str
 * @param {BufferEncoding} [encoding]
 */
exports.fromString = function fromString(str, encoding = 'utf8') {
  return Buffer.from(str, encoding);
};
