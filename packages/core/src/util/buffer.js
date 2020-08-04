'use strict';

const semver = require('semver');

// Node.js 0.12 is lacking support for Buffer.from,
// and < 4.5.0 version Buffer.from doesn't support string as parameter
const suppotsBufferFrom = Buffer.from && semver.satisfies(process.versions.node, '>=4.5.0');

exports.fromString = function fromString(str, encoding = 'utf8') {
  if (suppotsBufferFrom) {
    return Buffer.from(str, encoding);
  }
  // eslint-disable-next-line no-buffer-constructor
  return new Buffer(str, encoding);
};
