'use strict';

var semver = require('semver');

// Node.js 0.12 is lacking support for Buffer.from,
// and < 4.5.0 version Buffer.from doesn't support string as parameter

var isSupportedVersion = function() {
  return semver.satisfies(process.versions.node, '>=4.5.0');
};

exports.fromString = function fromString(str, encoding) {
  encoding = encoding || 'utf8';
  if (Buffer.from && isSupportedVersion() === true) {
    return Buffer.from(str, encoding);
  }
  return new Buffer(str, encoding);
};
