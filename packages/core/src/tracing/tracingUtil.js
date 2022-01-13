/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const crypto = require('crypto');
const path = require('path');
const StringDecoder = require('string_decoder').StringDecoder;

const stackTrace = require('../util/stackTrace');

const hexDecoder = new StringDecoder('hex');

let stackTraceLength = 10;

/**
 * @param {import('../util/normalizeConfig').InstanaConfig} config
 */
exports.init = function (config) {
  stackTraceLength = config.tracing.stackTraceLength;
};

/**
 * @param {Function} referenceFunction
 * @param {number} [drop]
 * @returns {Array.<*>}
 */
exports.getStackTrace = function getStackTrace(referenceFunction, drop) {
  return stackTrace.captureStackTrace(stackTraceLength, referenceFunction, drop);
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

/**
 * @param {number} length
 * @returns {string}
 */
exports.generateRandomId = function (length) {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

/**
 * @param {Buffer} buffer
 * @returns {{
 *  t: string,
 *  s: string
 * }}
 */
exports.readTraceContextFromBuffer = function readTraceContextFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error(`Not a buffer: ${buffer}`);
  }
  if (buffer.length !== 24) {
    throw new Error(`Only buffers of length 24 are supported: ${buffer}`);
  }
  // Check if the first 8 bytes are all zeroes:
  // (Beginning with Node.js 12, this check could be simply `buffer.readBigInt64BE(0) !== 0n) {`.)
  if (buffer.readInt32BE(0) !== 0 || buffer.readInt32BE(4) !== 0) {
    return { t: readHexFromBuffer(buffer, 0, 16), s: readHexFromBuffer(buffer, 16, 8) };
  } else {
    return { t: readHexFromBuffer(buffer, 8, 8), s: readHexFromBuffer(buffer, 16, 8) };
  }
};

/**
 * @param {Buffer} buffer
 * @param {number} offset
 * @param {number} length
 * @returns {string}
 */
function readHexFromBuffer(buffer, offset, length) {
  return hexDecoder.write(buffer.slice(offset, offset + length));
}

/**
 * @param {string} hexString
 * @param {Buffer} buffer
 * @param {number} offsetFromRight
 * @returns {Buffer}
 */
exports.unsignedHexStringToBuffer = function unsignedHexStringToBuffer(hexString, buffer, offsetFromRight) {
  /** @type {number} */
  let offset;
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
    throw new Error(`Only supported hex string lengths are 16 and 32, got: ${hexString}`);
  }
  writeHexToBuffer(hexString, buffer, offset);
  return buffer;
};

/**
 * @param {string} traceId
 * @param {string} spanId
 * @returns {Buffer}
 */
exports.unsignedHexStringsToBuffer = function unsignedHexStringsToBuffer(traceId, spanId) {
  const buffer = Buffer.alloc(24);
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
 * @param {string} hexString
 * @param {Buffer} buffer
 * @param {number} offset
 */
function writeHexToBuffer(hexString, buffer, offset) {
  // This implementation uses Node.js buffer internals directly:
  // https://github.com/nodejs/node/blob/92cef79779d121d934dcb161c068bdac35e6a963/lib/internal/buffer.js#L1005 ->
  // https://github.com/nodejs/node/blob/master/src/node_buffer.cc#L1196 /
  // https://github.com/nodejs/node/blob/master/src/node_buffer.cc#L681
  // @ts-ignore
  buffer.hexWrite(hexString, offset, hexString.length / 2);
}

/**
 * @param {import('./cls').InstanaBaseSpan} span
 * @returns {Buffer}
 */
exports.renderTraceContextToBuffer = function renderTraceContextToBuffer(span) {
  return exports.unsignedHexStringsToBuffer(span.t, span.s);
};

/**
 * @param {Error} err
 * @returns {string}
 */
exports.getErrorDetails = function getErrorDetails(err) {
  if (err == null) {
    return undefined;
  }
  return String(err.stack || err.message || err).substring(0, 500);
};

/**
 * @param {string} stmt
 * @returns {string}
 */
exports.shortenDatabaseStatement = function shortenDatabaseStatement(stmt) {
  if (stmt == null || typeof stmt !== 'string') {
    return undefined;
  }

  return stmt.substring(0, 4000);
};

/**
 * Iterates over all attributes of the given object and returns the first attribute for which the name matches the given
 * name in a case insensitive fashion, or null if no such attribute exists.
 *
 * @param {*} object
 * @param {string} key
 * @returns {*}
 */
exports.readAttribCaseInsensitive = function readAttribCaseInsensitive(object, key) {
  if (!object || typeof object !== 'object' || typeof key !== 'string') {
    return null;
  }
  if (object[key]) {
    // fast path for cases where case insensitive search is not required
    return object[key];
  }
  const keyUpper = key.toUpperCase();
  const allKeys = Object.keys(object);
  for (let i = 0; i < allKeys.length; i++) {
    if (typeof allKeys[i] === 'string' && allKeys[i].toUpperCase() === keyUpper) {
      return object[allKeys[i]];
    }
  }
  return null;
};

/**
 * In rare cases, we need to require a module from dependencies of the application under test, most notably specific
 * modules from packages that we instrument. This works without issues when the application under test has installed
 * @instana/collector and friends as a normal dependency, because then our packages are located in the same node_modules
 * folder and our instrumentation module will have a module load path list
 * (see https://nodejs.org/api/modules.html#modulepaths) that includes the application's node_modules folder.
 *
 * The situation is different when we are loaded via "--require" from a global installation -- this is the norm for
 * @instana/aws-fargate, @instana/google-cloud-run, the Kubernetes autotrace webhook
 * (https://www.ibm.com/docs/de/obi/current?topic=kubernetes-instana-autotrace-webhook) or when using the global
 * installation pattern for @instana/collector that does not require modifying the source code
 * (see * https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#global-installation).
 *
 * In these scenarios, the module load path list does not include the application's node_module folder. Thus we need to
 * be a bit more clever when requiring a module from the application's dependencies. We solve this by constructing the
 * file system path of the desired module by using a known path from a module of the same package and the relative path
 * from that module to the module we need to load. Note that instrumentations which use the requireHook module can
 * obtain the base path via their onModuleLoad/onFileLoad callbacks.
 *
 * @param {string} basePath the absolute file system path of a module that is close to the one that should be loaded
 * @param {[string]} relativePath the relative path from the basePath to the desired module
 * @returns {*} the requested module
 */
exports.requireModuleFromApplicationUnderMonitoringSafely = function requireModuleFromApplicationUnderMonitoringSafely(
  basePath,
  ...relativePath
) {
  return require(path.join(basePath, ...relativePath));
};
