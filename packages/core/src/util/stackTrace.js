/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

/**
 * @typedef {Error & {_jsonStackTrace: Array.<InstanaCallSite>}} InstanaExtendedError
 */

// See v8 Error API docs at
// https://v8.dev/docs/stack-trace-api

/**
 * @param {number} length
 * @param {Function} referenceFunction
 * @param {number} [drop]
 * @returns {Array.<*>}
 */
exports.captureStackTrace = function captureStackTrace(length, referenceFunction, drop = 0) {
  if (length <= 0) {
    return [];
  }

  referenceFunction = referenceFunction || captureStackTrace;
  const originalLimit = Error.stackTraceLimit;
  const originalPrepareStackTrace = Error.prepareStackTrace;
  Error.stackTraceLimit = length + drop;
  Error.prepareStackTrace = jsonPrepareStackTrace;
  /** @type {*} */
  const stackTraceTarget = {};
  Error.captureStackTrace(stackTraceTarget, referenceFunction);
  if (stackTraceTarget.stack == null || stackTraceTarget.stack.length === 0) {
    // Fallback in case we have been passed a bogus referenceFunction which leads to Error.captureStackTrace returning
    // an empty array. With this fallback, we at least get a stack trace that contains the source of the call. The
    // drawback is that it might show too much, but that's better than not having any stack trace at all.
    Error.captureStackTrace(stackTraceTarget);
  }

  let stack = stackTraceTarget.stack;

  if (!Array.isArray(stack)) {
    stack = [];
  }

  Error.stackTraceLimit = originalLimit;
  Error.prepareStackTrace = originalPrepareStackTrace;

  if (drop > 0 && stack.length >= drop) {
    stack.splice(0, drop);
  }
  return stack;
};

/**
 * @param {number} length
 * @param {InstanaExtendedError} error
 */
exports.getStackTraceAsJson = function getStackTraceAsJson(length, error) {
  if (length <= 0) {
    return [];
  }

  const originalLimit = Error.stackTraceLimit;
  const originalPrepareStackTrace = Error.prepareStackTrace;
  Error.stackTraceLimit = length;
  Error.prepareStackTrace = attachJsonStackTrace;
  // access error.stack to trigger attachJsonStackTrace to be called
  // eslint-disable-next-line no-unused-expressions
  error.stack;
  Error.stackTraceLimit = originalLimit;
  Error.prepareStackTrace = originalPrepareStackTrace;
  const jsonStackTrace = error._jsonStackTrace;
  delete error._jsonStackTrace;
  return jsonStackTrace;
};

/**
 * @param {Error} error
 * @param {Array<*>} structuredStackTrace
 */
function jsonPrepareStackTrace(error, structuredStackTrace) {
  return jsonifyStackTrace(structuredStackTrace);
}

/**
 * @param {Error} error
 * @param {Array<NodeJS.CallSite>} structuredStackTrace
 */
function attachJsonStackTrace(error, structuredStackTrace) {
  /** @type {InstanaExtendedError} */ (error)._jsonStackTrace = jsonifyStackTrace(structuredStackTrace);
  return defaultPrepareStackTrace(error, structuredStackTrace);
}

/**
 * @typedef {Object} InstanaCallSite
 * @property {string} m
 * @property {string} c
 * @property {number} n
 */

/**
 * @param {Array<NodeJS.CallSite>} structuredStackTrace
 * @returns {Array.<InstanaCallSite>}
 */
function jsonifyStackTrace(structuredStackTrace) {
  const len = structuredStackTrace.length;
  /** @type {Array.<InstanaCallSite>} */
  const result = new Array(len);

  for (let i = 0; i < len; i++) {
    const callSite = structuredStackTrace[i];
    result[i] = {
      m: exports.buildFunctionIdentifier(callSite),
      c: callSite.getFileName() || undefined,
      n: callSite.getLineNumber() || undefined
    };
  }

  return result;
}

/**
 * @param {NodeJS.CallSite} callSite
 * @returns {string}
 */
exports.buildFunctionIdentifier = function buildFunctionIdentifier(callSite) {
  if (callSite.isConstructor()) {
    return `new ${callSite.getFunctionName()}`;
  }

  let name;
  const methodName = callSite.getMethodName();
  const functionName = callSite.getFunctionName();
  const type = callSite.getTypeName();

  if (!methodName && !functionName) {
    return '<anonymous>';
  } else if ((functionName && !methodName) || (!functionName && methodName)) {
    name = functionName || methodName;
    if (type) {
      return `${type}.${name}`;
    }
    return name;
  } else if (functionName === methodName) {
    if (type) {
      return `${type}.${functionName}`;
    }
    return functionName;
  }

  let label = '';
  if (type) {
    label += `${type}.`;
  }
  label += functionName;
  label += ` [as ${methodName}]`;
  return label;
};

/**
 * @param {Error} error
 * @param {Array<*>} frames
 */
function defaultPrepareStackTrace(error, frames) {
  frames.push(error);
  return frames.reverse().join('\n    at ');
}

/**
 * Parses a string stack trace into the structured format used by Instana.
 * Extracts function name, file path, and line number from each frame.
 *
 * @param {string} stackString - The string stack trace to parse
 * @returns {Array.<InstanaCallSite>} - Array of structured call site objects
 */
exports.parseStackTraceFromString = function parseStackTraceFromString(stackString) {
  try {
    if (typeof stackString !== 'string') {
      return [];
    }

    const stackLines = stackString.split('\n');
    /** @type {Array.<InstanaCallSite>} */
    const callSites = [];

    stackLines.forEach(rawStackLine => {
      const normalizedLine = rawStackLine.trim();

      // stack traces start with at, otherwise ignore
      if (!normalizedLine.startsWith('at ')) return;

      const frameText = normalizedLine.slice(3).trim();

      /** @type {InstanaCallSite} */
      const callSite = {
        m: '<anonymous>',
        c: null,
        n: null
      };

      let functionName;
      let locationText = frameText;

      // Try "(location)" format first
      const openParenIndex = frameText.lastIndexOf('(');
      if (openParenIndex !== -1 && frameText.endsWith(')')) {
        const candidateLocation = frameText.slice(openParenIndex + 1, -1);
        const parsed = parseLocation(candidateLocation);

        if (parsed) {
          functionName = frameText.slice(0, openParenIndex).trim();
          locationText = candidateLocation;
          callSite.c = parsed.file;
          callSite.n = parsed.line;
        }
      }

      // If not parsed yet i.e, without parens, try entire frame
      if (callSite.c === null) {
        const parsed = parseLocation(locationText);
        if (parsed) {
          callSite.c = parsed.file;
          callSite.n = parsed.line;
        }
      }

      // Resolve method name
      if (functionName) {
        callSite.m = functionName;
      } else if (callSite.c === null) {
        callSite.m = frameText;
      }

      callSites.push(callSite);
    });

    return callSites;
  } catch {
    return [];
  }
};

/**
 * Parses "file:line[:column]" safely without regex
 * @param {string} locationText
 */
function parseLocation(locationText) {
  const lastColon = locationText.lastIndexOf(':');

  // file only (no line info)
  if (lastColon === -1) {
    return { file: locationText, line: null };
  }

  const lastPart = parseInt(locationText.slice(lastColon + 1), 10);
  if (isNaN(lastPart)) {
    return { file: locationText, line: null };
  }

  const beforeLast = locationText.slice(0, lastColon);
  const secondLastColon = beforeLast.lastIndexOf(':');

  // file:line:column
  if (secondLastColon !== -1) {
    const line = parseInt(beforeLast.slice(secondLastColon + 1), 10);
    if (!isNaN(line)) {
      return {
        file: beforeLast.slice(0, secondLastColon),
        line
      };
    }
  }

  return {
    file: beforeLast,
    line: lastPart
  };
}
