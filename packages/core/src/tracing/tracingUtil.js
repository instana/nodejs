'use strict';

var crypto = require('crypto');
var StringDecoder = require('string_decoder').StringDecoder;
var hexDecoder = new StringDecoder('hex');

var stackTrace = require('../util/stackTrace');

var stackTraceLength = 10;

exports.init = function(config) {
  stackTraceLength = config.tracing.stackTraceLength;
};

exports.getStackTrace = function getStackTrace(referenceFunction) {
  return stackTrace.captureStackTrace(stackTraceLength, referenceFunction);
};

exports.generateRandomTraceId = function generateRandomTraceId() {
  // Note: As soon as all Instana tracers support 128 bit trace IDs we can generate a string of length 32 here.
  return exports.generateRandomId(16);
};

exports.generateRandomLongTraceId = function generateRandomLongTraceId() {
  return exports.generateRandomId(32);
};

exports.generateRandomSpanId = function generateRandomSpanId() {
  return exports.generateRandomId(16);
};

exports.generateRandomId = function(length) {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

exports.readTraceContextFromBuffer = function readTraceContextFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Not a buffer: ' + buffer);
  }
  if (buffer.length !== 24) {
    throw new Error('Only buffers of length 24 are supported: ' + buffer);
  }
  // Check if the first 8 bytes are all zeroes:
  // (Beginning with Node.js 12, this check could be simply `buffer.readBigInt64BE(0) !== 0n) {`.)
  if (buffer.readInt32BE(0) !== 0 || buffer.readInt32BE(4) !== 0) {
    return { t: readHexFromBuffer(buffer, 0, 16), s: readHexFromBuffer(buffer, 16, 8) };
  } else {
    return { t: readHexFromBuffer(buffer, 8, 8), s: readHexFromBuffer(buffer, 16, 8) };
  }
};

function readHexFromBuffer(buffer, offset, length) {
  return hexDecoder.write(buffer.slice(offset, offset + length));
}

exports.unsignedHexStringToBuffer = function unsignedHexStringToBuffer(hexString, buffer, offsetFromRight) {
  var offset;
  if (buffer && offsetFromRight != null) {
    offset = buffer.length - hexString.length / 2 - offsetFromRight;
  } else {
    offset = 0;
  }

  if (hexString.length === 16) {
    buffer = buffer || Buffer.alloc(8);
  } else if (hexString.length === 32) {
    buffer = buffer || Buffer.alloc(16);
  } else {
    throw new Error('Only supported hex string lengths are 16 and 32, got: ' + hexString);
  }
  writeHexToBuffer(hexString, buffer, offset);
  return buffer;
};

exports.unsignedHexStringsToBuffer = function unsignedHexStringsToBuffer(traceId, spanId) {
  var buffer = Buffer.alloc(24);
  exports.unsignedHexStringToBuffer(traceId, buffer, 8);
  exports.unsignedHexStringToBuffer(spanId, buffer, 0);
  return buffer;
};

/**
 * Writes characters from a hex string directly to a buffer. The buffer will contain a binary representation of the
 * given hex string after this operation. No length checks are executed, so the caller is responsible for writing within
 * the bounds of the given buffer.
 *
 * The string hexString must only contain the characters [0-9a-f].
 */
function writeHexToBuffer(hexString, buffer, offset) {
  // This implementation uses Node.js buffer internals directly:
  // https://github.com/nodejs/node/blob/92cef79779d121d934dcb161c068bdac35e6a963/lib/internal/buffer.js#L1005 ->
  // https://github.com/nodejs/node/blob/master/src/node_buffer.cc#L1196 /
  // https://github.com/nodejs/node/blob/master/src/node_buffer.cc#L681
  buffer.hexWrite(hexString, offset, hexString.length / 2);
}

exports.renderTraceContextToBuffer = function renderTraceContextToBuffer(span) {
  return exports.unsignedHexStringsToBuffer(span.t, span.s);
};

exports.getErrorDetails = function getErrorDetails(err) {
  if (err == null) {
    return undefined;
  }
  return String(err.stack || err.message || err).substring(0, 500);
};

exports.shortenDatabaseStatement = function shortenDatabaseStatement(stmt) {
  if (stmt == null || typeof stmt !== 'string') {
    return undefined;
  }

  return stmt.substring(0, 4000);
};

exports.readAttribCaseInsensitive = function readAttribCaseInsensitive(object, key) {
  if (!object || typeof object !== 'object' || typeof key !== 'string') {
    return null;
  }
  var keyUpper = key.toUpperCase();
  var allKeys = Object.keys(object);
  for (var i = 0; i < allKeys.length; i++) {
    if (typeof allKeys[i] === 'string' && allKeys[i].toUpperCase() === keyUpper) {
      return object[allKeys[i]];
    }
  }
  return null;
};
