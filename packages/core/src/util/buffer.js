/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const semver = require('semver');

// This is no longer used as of release 1.110.3, but apparently there are setups where the version of @instana/collector
// and @instana/core do not match, so we need to keep this around for a while for backwards compatibility.

// Node.js 0.12 is lacking support for Buffer.from,
// and < 4.5.0 version Buffer.from doesn't support string as parameter
const suppotsBufferFrom = Buffer.from && semver.satisfies(process.versions.node, '>=4.5.0');

/**
 * @param {string} str
 * @param {BufferEncoding} [encoding]
 */
exports.fromString = function fromString(str, encoding = 'utf8') {
  if (suppotsBufferFrom) {
    return Buffer.from(str, encoding);
  }
  // eslint-disable-next-line no-buffer-constructor
  return new Buffer(str, encoding);
};
