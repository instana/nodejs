'use strict';

// Node.js 0.12 is lacking support for Buffer.from
exports.fromString = function fromString(str, encoding) {
  encoding = encoding || 'utf8';
  if (Buffer.from) {
    return Buffer.from(str, encoding);
  }
  return new Buffer(str, encoding);
};
