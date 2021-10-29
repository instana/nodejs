/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const constants = require('../constants');
const leftPad = require('../leftPad');

const W3cTraceContext = require('./W3cTraceContext');

/** @type {import('../../logger').GenericLogger} */
let logger;
logger = require('../../logger').getLogger('tracing/W3C trace context parser', newLogger => {
  logger = newLogger;
});

const versionRegex = /^([0-9a-f]{2})-.*$/;
const regexVersion00 = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const regexUnknownVersion = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2}).*$/;
const instanaVendorKeyOffset = constants.w3cInstanaEquals.length;

/**
 * @param {string} traceParentRaw
 * @param {string} traceStateRaw
 * @returns {W3cTraceContext}
 */
module.exports = function parse(traceParentRaw, traceStateRaw) {
  const parsed = new W3cTraceContext();
  parseTraceParent(traceParentRaw, parsed);
  if (!parsed.traceParentValid) {
    return parsed;
  }
  parseTraceState(traceStateRaw, parsed);
  return parsed;
};

/**
 * @param {string} traceParentRaw
 * @param {W3cTraceContext} parsed
 */
function parseTraceParent(traceParentRaw, parsed) {
  if (typeof traceParentRaw !== 'string') {
    return;
  }
  const versionMatch = versionRegex.exec(traceParentRaw);
  if (!versionMatch || versionMatch[1] === 'ff') {
    return;
  }
  parsed.version = versionMatch[1];

  const regex = parsed.version === W3cTraceContext.VERSION00 ? regexVersion00 : regexUnknownVersion;
  const match = regex.exec(traceParentRaw);
  if (!match) {
    return;
  }
  parsed.traceParentTraceId = match[1];
  parsed.traceParentParentId = match[2];
  const flags = parseInt(match[3], 16);
  // eslint-disable-next-line no-bitwise
  parsed.sampled = (flags & W3cTraceContext.SAMPLED_BITMASK) === W3cTraceContext.SAMPLED_BITMASK;

  if (parsed.traceParentTraceId === '00000000000000000000000000000000') {
    return;
  }
  if (parsed.traceParentParentId === '0000000000000000') {
    return;
  }

  parsed.traceParentValid = true;
}

/**
 * @param {string} traceStateRaw
 * @param {W3cTraceContext} parsed
 */
function parseTraceState(traceStateRaw, parsed) {
  if (typeof traceStateRaw !== 'string') {
    return;
  }

  const keyValuePairs = traceStateRaw
    .split(',')
    .map(kv => kv.trim())
    .filter(kv => kv && kv.indexOf('=') >= 0);

  if (keyValuePairs.length === 0) {
    // Exit early and retain parsed.traceStateValid = false when the tracestate header does not have a single valid key
    // value pair.
    return;
  }

  const indexOfInstanaKeyValuePair = keyValuePairs.findIndex(
    kv => kv.toLowerCase().indexOf(constants.w3cInstanaEquals) === 0
  );
  if (indexOfInstanaKeyValuePair >= 0) {
    parsed.traceStateHead = keyValuePairs.slice(0, Math.min(indexOfInstanaKeyValuePair, 31));
    if (parsed.traceStateHead.length === 0) {
      parsed.traceStateHead = null;
    }
    parseInstanaTraceStateKeyValuePair(parsed, keyValuePairs[indexOfInstanaKeyValuePair]);
    parsed.traceStateTail = keyValuePairs
      .slice(indexOfInstanaKeyValuePair + 1, 32)
      // Remove non spec compliant instana key value pairs (there must only key-value pair be one per vendor).
      .filter(kv => kv.toLowerCase().indexOf(constants.w3cInstanaEquals) < 0);
    if (parsed.traceStateTail.length === 0) {
      parsed.traceStateTail = null;
    }
  } else {
    parsed.traceStateHead = keyValuePairs.slice(0, 32);
    parsed.traceStateTail = null;
  }

  parsed.traceStateValid = true;
}

/**
 * @param {W3cTraceContext} parsed
 * @param {string} instanaKeyValuePair
 */
function parseInstanaTraceStateKeyValuePair(parsed, instanaKeyValuePair) {
  const fields = instanaKeyValuePair.substring(instanaVendorKeyOffset).split(';');
  parsed.instanaTraceId = normalizeId(fields[0], true);
  parsed.instanaParentId = normalizeId(fields[1], false);
}

/**
 * @param {string} id
 * @param {boolean} isTraceId
 * @returns {string | null}
 */
function normalizeId(id, isTraceId) {
  if (!id || typeof id !== 'string' || id.trim() === '') {
    logger.warn(`Received an invalid ${isTraceId ? 'trace' : 'span'} ID: "${id}"`);
    return null;
  }

  if (id.length === 16 || (id.length === 32 && isTraceId)) {
    // fast path for the valid case
    return id;
  }

  if (id.length < 16) {
    // We deliberately ignore the isTraceId and only left-pad to 16 chars if the ID is shorter than 16 chars.
    return leftPad(id, 16);
  } else if (id.length < 32 && isTraceId) {
    return leftPad(id, 32);
  } else if (id.length > 16 && !isTraceId) {
    logger.warn(`Received an invalid (too long) span ID: ${id}`);
    return null;
  } else if (id.length > 32) {
    logger.warn(`Received an invalid (too long) trace ID: ${id}`);
    return null;
  }

  // should never happen, all cases are covered above
  return id;
}
