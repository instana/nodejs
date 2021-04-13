/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const constants = require('../constants');
const tracingUtil = require('../tracingUtil');

const VERSION00 = '00';
const LEFT_PAD_16 = '0000000000000000';
const SAMPLED_BITMASK = 0x00000001;

function W3cTraceContext() {
  // whether the traceparent header is valid
  this.traceParentValid = false;
  // the trace context specification version from the traceparent header
  this.version = undefined;
  // the trace id from the traceparent header
  this.traceParentTraceId = undefined;
  // the parent id from the traceparent header
  this.traceParentParentId = undefined;
  // the sampled flag from the traceparent header
  this.sampled = undefined;

  // whether the tracestate header is valid
  this.traceStateValid = false;
  // the non-Instana key-value pairs that come before the in key-value pair
  this.traceStateHead = undefined;
  // the trace ID from the in key-value pair from the tracestate header
  this.instanaTraceId = undefined;
  // the parent ID from the in key-value pair from the tracestate header
  this.instanaParentId = undefined;
  // the non-Instana key-value pairs that come after the in key-value pair
  this.traceStateTail = undefined;
}

/**
 * @param {string} instanaTraceId
 * @param {string} instanaParentId
 * @param {boolean | *} sampled
 * @returns {W3cTraceContext}
 */
W3cTraceContext.fromInstanaIds = function fromInstanaIds(instanaTraceId, instanaParentId, sampled) {
  const paddedTraceId = instanaTraceId.length === 16 ? LEFT_PAD_16 + instanaTraceId : instanaTraceId;
  sampled = typeof sampled === 'boolean' ? sampled : true;
  const traceContext = new W3cTraceContext();
  traceContext.traceParentValid = true;
  traceContext.version = VERSION00;
  traceContext.traceParentTraceId = paddedTraceId;
  traceContext.traceParentParentId = instanaParentId;
  traceContext.sampled = sampled;

  traceContext.traceStateValid = true;
  traceContext.instanaTraceId = instanaTraceId;
  traceContext.instanaParentId = instanaParentId;

  return traceContext;
};

/**
 * @param {string} traceId
 * @param {string} parentId
 * @returns
 */
W3cTraceContext.createEmptyUnsampled = function createEmptyUnsampled(traceId, parentId) {
  const paddedTraceId = traceId.length === 16 ? LEFT_PAD_16 + traceId : traceId;
  const traceContext = new W3cTraceContext();
  traceContext.traceParentValid = true;
  traceContext.version = VERSION00;
  traceContext.traceParentTraceId = paddedTraceId;
  traceContext.traceParentParentId = parentId;
  traceContext.sampled = false;
  traceContext.traceStateValid = true;
  return traceContext;
};

/**
 * @returns {string}
 */
W3cTraceContext.prototype.renderTraceParent = function renderTraceParent() {
  if (!this.traceParentValid) {
    return '';
  }
  // Since we only support version 00, we must always downgrade to 00 if we have updated any value.
  return `00-${this.traceParentTraceId}-${this.traceParentParentId}-${this.renderFlags()}`;
};

/**
 * @returns {'01' | '00'}
 */
W3cTraceContext.prototype.renderFlags = function renderFlags() {
  return this.sampled ? '01' : '00';
};

/**
 * @returns {boolean}
 */
W3cTraceContext.prototype.hasTraceState = function hasTraceState() {
  return ((this.instanaTraceId && this.instanaParentId) || this.traceStateHead || this.traceStateTail) != null;
};

/**
 * @returns {string}
 */
W3cTraceContext.prototype.renderTraceState = function renderTraceState() {
  if (!this.traceStateValid) {
    return '';
  }
  /** @type {Array.<*>} */
  let allKeyValuePairs = [];
  const instanaKeyValuePair = this.renderInstanaTraceStateValue();
  if (this.traceStateHead) {
    allKeyValuePairs = allKeyValuePairs.concat(this.traceStateHead);
  }
  if (instanaKeyValuePair) {
    allKeyValuePairs.push(instanaKeyValuePair);
  }
  if (this.traceStateTail) {
    allKeyValuePairs = allKeyValuePairs.concat(this.traceStateTail);
  }
  return allKeyValuePairs.join(',');
};

W3cTraceContext.prototype.renderInstanaTraceStateValue = function renderInstanaTraceStateValue() {
  if (this.instanaTraceId && this.instanaParentId) {
    return `${constants.w3cInstanaEquals + this.instanaTraceId};${this.instanaParentId}`;
  } else {
    return null;
  }
};

W3cTraceContext.prototype.resetTraceState = function resetTraceState() {
  this.traceStateValid = true;
  this.traceStateHead = null;
  this.instanaTraceId = null;
  this.instanaParentId = null;
  this.traceStateTail = null;
};

/**
 * Modifies this trace context object:
 * - updates the foreing parent ID in traceparent to the given given value (not that we do not set the
 *   foreign trace ID),
 * - sets the sampled flag in traceparent to true,
 * - upserts the in key-value pair in tracestate to the given trace ID and span ID, and moved to the leftmost position.
 * @param {string} instanaTraceId
 * @param {string} instanaParentId
 */
W3cTraceContext.prototype.updateParent = function updateParent(instanaTraceId, instanaParentId) {
  this.instanaTraceId = instanaTraceId;
  this.instanaParentId = instanaParentId;
  this.traceParentParentId = instanaParentId;
  if (this.traceStateHead && this.traceStateTail) {
    this.traceStateTail = this.traceStateHead.concat(this.traceStateTail);
  } else if (this.traceStateHead) {
    this.traceStateTail = this.traceStateHead;
  }
  // ^ If only this.traceStateTail has content, we do not need to update this.traceStateHead nor this.traceStateTail;
  // we only need to make sure all foreign key-value pairs come to the right of the in key-value pair, which they
  // do, if they are only in traceStateTail.

  // Remove everything from traceStateHead to move the in key-value pair to the leftmost position.
  this.traceStateHead = null;
  this.sampled = true;
};

/**
 * @param {string} longTraceId
 */
W3cTraceContext.prototype.restartTrace = function restartTrace(longTraceId) {
  this.traceParentValid = true;
  this.version = VERSION00;
  this.instanaTraceId = longTraceId ? tracingUtil.generateRandomLongTraceId() : tracingUtil.generateRandomTraceId();

  this.traceParentTraceId = longTraceId ? this.instanaTraceId : LEFT_PAD_16 + this.instanaTraceId;
  this.traceParentParentId = this.instanaParentId = tracingUtil.generateRandomSpanId();
  this.sampled = true;

  this.traceStateValid = true;
  this.traceStateHead = null;
  this.traceStateTail = null;
};

W3cTraceContext.prototype.disableSampling = function disableSampling() {
  if (this.sampled) {
    // See https://www.w3.org/TR/trace-context/#mutating-the-traceparent-field
    // "The parent-id field MUST be set to a new value with the sampled flag update."
    this.traceParentParentId = tracingUtil.generateRandomSpanId();
  }
  this.sampled = false;
};

W3cTraceContext.prototype.clone = function clone() {
  return Object.assign(new W3cTraceContext(), this);
};

W3cTraceContext.prototype.getMostRecentForeignTraceStateMember = function getMostRecentForeignTraceStateMember() {
  const traceStateToInspect = this.traceStateHead ? this.traceStateHead : this.traceStateTail;
  if (!traceStateToInspect || traceStateToInspect.length === 0) {
    return undefined;
  }
  return traceStateToInspect[0];
};

W3cTraceContext.VERSION00 = VERSION00;
W3cTraceContext.SAMPLED_BITMASK = SAMPLED_BITMASK;

module.exports = W3cTraceContext;
