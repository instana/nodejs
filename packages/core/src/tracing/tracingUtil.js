/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const crypto = require('crypto');
const path = require('path');
const StringDecoder = require('string_decoder').StringDecoder;

const stackTrace = require('../util/stackTrace');
const { DEFAULT_STACK_TRACE_LENGTH, DEFAULT_STACK_TRACE_MODE, STACK_TRACE_MODES } = require('../util/constants');

/** @type {import('../core').GenericLogger} */
let logger;
const hexDecoder = new StringDecoder('hex');
/**
 * @type {number}
 */
let stackTraceLength;
/**
 * @type {string}
 */
// eslint-disable-next-line no-unused-vars
let stackTraceMode;
/**
 * @param {import('../config').InstanaConfig} config
 */
exports.init = function (config) {
  logger = config.logger;
  stackTraceLength = config?.tracing?.stackTraceLength;
  stackTraceMode = config?.tracing?.stackTrace;
};

/**
 * @param {import('@instana/collector/src/types/collector').AgentConfig} extraConfig
 */
exports.activate = function activate(extraConfig) {
  const agentTraceConfig = extraConfig?.tracing;

  // Note: We check whether the already-initialized stackTraceLength equals the default value.
  //       If it does, we can safely override it, since the user did not explicitly configure it.

  // Note: If the user configured a value via env or code and also configured a different value in the agent,
  //       but the env/code value happens to equal the default, the agent value would overwrite it.
  //       This is a rare edge case and acceptable for now.

  if (agentTraceConfig?.stackTrace && stackTraceMode === DEFAULT_STACK_TRACE_MODE) {
    stackTraceMode = agentTraceConfig.stackTrace;
  }

  // stackTraceLength is valid when set to any number, including 0
  if (agentTraceConfig?.stackTraceLength != null && stackTraceLength === DEFAULT_STACK_TRACE_LENGTH) {
    stackTraceLength = agentTraceConfig.stackTraceLength;
  }
};

/**
 * @param {Function} referenceFunction
 * @param {number} [drop]
 * @returns {Array.<*>}
 */
exports.getStackTrace = function getStackTrace(referenceFunction, drop) {
  if (stackTraceMode === STACK_TRACE_MODES.NONE || stackTraceMode === STACK_TRACE_MODES.ERROR) {
    return [];
  }
  return stackTrace.captureStackTrace(stackTraceLength, referenceFunction, drop);
};

exports.generateRandomTraceId = function generateRandomTraceId() {
  // Maintenance note (128-bit-trace-ids): As soon as all Instana tracers support 128 bit trace IDs we can generate a
  // string of length 32 here.
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
 *  t?: string,
 *  s?: string
 * }}
 */
exports.readTraceContextFromBuffer = function readTraceContextFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    logger.error(`Not a buffer: ${buffer}`);
    return {};
  }
  if (buffer.length !== 24) {
    logger.error(`Only buffers of length 24 are supported: ${buffer}`);
    return {};
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
  return hexDecoder.write(buffer.subarray(offset, offset + length));
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
    logger.error(`Only hex strings of lengths 16 or 32 can be converted, received: ${hexString}`);
    return buffer;
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
 * @param {import('../core').InstanaBaseSpan} span
 * @returns {Buffer}
 */
exports.renderTraceContextToBuffer = function renderTraceContextToBuffer(span) {
  return exports.unsignedHexStringsToBuffer(span.t, span.s);
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
 * @param {string} connectionStr
 * @returns {string}
 */
exports.sanitizeConnectionStr = function sanitizeConnectionStr(connectionStr) {
  if (connectionStr == null || typeof connectionStr !== 'string') {
    return undefined;
  }

  const replaced = connectionStr.replace(/PWD\s*=\s*[^;]*/, 'PWD=<redacted>');
  return replaced;
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
 * (https://www.ibm.com/docs/en/instana-observability/current?topic=kubernetes-instana-autotrace-webhook) or when
 * using the global installation pattern for @instana/collector that does not require modifying the source code see(
 * https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation#installing-the-
 * collector-globally).
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

exports.findCallback = (/** @type {string | any[]} */ originalArgs) => {
  let originalCallback;
  let callbackIndex = -1;

  // CASE: libraries pass a class into a function as argument
  const isClass = (/** @type {any} */ fn) => {
    return typeof fn === 'function' && /^\s*class\s+/.test(Function.prototype.toString.call(fn));
  };

  // If there is any function that takes two or more functions as an argument,
  // the convention would be to pass in the callback as the last argument, thus searching
  // from the end backwards might be marginally safer.
  for (let i = originalArgs.length - 1; i >= 0; i--) {
    if (typeof originalArgs[i] === 'function' && !isClass(originalArgs[i])) {
      originalCallback = originalArgs[i];
      callbackIndex = i;
      break;
    }
  }

  return {
    originalCallback,
    callbackIndex
  };
};

exports.extractErrorMessage = (/** @type {any} */ normalizedError) => {
  // If error has cause property that is an Error, we want to extract the message from the cause
  // Reference Node.js error cause: https://nodejs.org/api/errors.html#errorcause
  if (normalizedError?.cause instanceof Error) {
    normalizedError = normalizedError.cause;
  }

  if (normalizedError?.details) {
    return `${normalizedError.name || 'Error'}: ${normalizedError.details}`;
  } else if (normalizedError?.message) {
    return `${normalizedError.name || 'Error'}: ${normalizedError.message}`;
  } else {
    return normalizedError?.code || 'No error message found.';
  }
};

/**
 * Sets error details on a span for a specific technology.
 * Handles different error formats: strings, objects with details/message/code properties.
 * Supports nested paths for SDK spans via dot-separated strings or arrays.
 *
 * Examples:
 * - setErrorDetails(span, error, 'nats') // flat key
 * - setErrorDetails(span, error, 'sdk.custom.tags.message') // dot-separated string
 * - setErrorDetails(span, error, ['sdk', 'custom', 'tags', 'message']) // array path
 *
 * @param {import('../core').InstanaBaseSpan} span - The span to update
 * @param {Error | string | Object} error - The error object, error string, or object with error properties
 * @param {string | Array<string>} technology - The technology name or nested path
 */
exports.setErrorDetails = function setErrorDetails(span, error, technology) {
  try {
    if (!error) {
      return;
    }

    // Normalize error to object format at the beginning
    /** @type {{
     *   message?: string,
     *   stack?: string | null,
     *   name?: string,
     *   code?: string,
     *   details?: string,
     *   cause?: any
     * }}
     */
    let normalizedError;

    if (typeof error === 'string') {
      normalizedError = { message: error, stack: null };
    } else {
      normalizedError = error;
    }

    const errorMessage = exports.extractErrorMessage(normalizedError);

    let errorPath = null;
    if (Array.isArray(technology)) {
      errorPath = technology;
    } else if (typeof technology === 'string' && technology.includes('.')) {
      errorPath = technology.split('.');
    }

    if (errorPath) {
      let target = span.data;

      // Traverse the object path and create missing nested objects along the way
      // Without this, deeper properties would fail to assign if their parent objects don't exist
      for (let i = 0; i < errorPath.length - 1; i++) {
        const key = errorPath[i];
        if (!target[key]) {
          target[key] = {};
        }
        target = target[key];
      }

      const errorKey = errorPath[errorPath.length - 1];

      if (!target[errorKey]) {
        target[errorKey] = errorMessage.substring(0, 200);
      }
    } else if (typeof technology === 'string' && technology && span.data?.[technology]) {
      if (!span.data[technology].error) {
        span.data[technology].error = errorMessage.substring(0, 200);
      }
    }

    // If the mode is none, we set span.data[technology].error (as done above) and return immediately
    if (stackTraceMode === STACK_TRACE_MODES.NONE) {
      return;
    }

    // If stack trace collection is set to 'error' or 'all' and an error occurs,
    // generate a stack trace from the error and overwrite any existing stack.
    // If the error has a `cause` property and it is an Error instance, prefer
    // the cause’s stack trace, as it represents the root cause.
    // See: https://nodejs.org/api/errors.html#errorcause
    const stackToUse =
      (normalizedError?.cause instanceof Error && normalizedError.cause.stack) || normalizedError.stack;

    if (stackToUse) {
      const stackArray = stackTrace.parseStackTraceFromString(stackToUse);
      span.stack = stackArray.length > 0 ? stackArray.slice(0, stackTraceLength) : span.stack || [];
    } else {
      span.stack = span.stack || [];
    }
  } catch (err) {
    logger.error('Failed to set error details on span:', err);
  }

  /**
   * Handles unexpected return values from instrumented functions (Case 5: Unsupported/Bug case).
   * Logs a debug message and marks the span as incomplete when the return value is not a promise.
   *
   * @param {*} returnValue - The return value from the instrumented function
   * @param {import('../core').InstanaBaseSpan} targetSpan - The span to mark as incomplete
   * @param {string} spanName - The name of the span (e.g., 'redis', 'postgres', 'mysql')
   * @param {string} operationContext - Additional context about the operation (e.g., 'query', 'command')
   * @returns {boolean} - Returns true if the return value was unexpected (not a promise), false otherwise
   */
  exports.handleUnexpectedReturnValue = function handleUnexpectedReturnValue(
    returnValue,
    targetSpan,
    spanName,
    operationContext
  ) {
    if (typeof returnValue?.then === 'function') {
      return false;
    }

    // Case: This is the unexpected case where returnValue is not a promise
    logger.debug(
      `${spanName} instrumentation: Unexpected return value from ${operationContext}. ` +
        `Expected a promise but got: ${typeof returnValue}. ` +
        'This may indicate an instrumentation bug or unsupported library behavior.'
    );

    // using sdk custom tags, we mark this span as incomplete
    if (!targetSpan.data.sdk) {
      targetSpan.data.sdk = {};
    }
    if (!targetSpan.data.sdk.custom) {
      targetSpan.data.sdk.custom = {};
    }
    if (!targetSpan.data.sdk.custom.tags) {
      targetSpan.data.sdk.custom.tags = {};
    }
    targetSpan.data.sdk.custom.tags.incomplete = true;
    targetSpan.data.sdk.custom.tags.incompleteReason = 'unexpected_return_type';

    return true;
  };
};
