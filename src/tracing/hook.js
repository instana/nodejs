'use strict';

var asyncHook = require('async-hook');

var stackTrace = require('../util/stackTrace');

var stackTraceLength = 0;
var simulatedUidCounter = 0;

var active = null;
var handleData = {};

var handleDefaults = {
  spanId: null,
  parentSpanId: null,
  traceId: null,
  suppressTracing: false,
  containsExitSpan: false
};

exports.init = function init(config) {
  stackTraceLength = config.tracing.stackTraceLength != null ? config.tracing.stackTraceLength : 10;
  active = null;
  asyncHook.addHooks({
    init: exports.initAsync,
    pre: exports.preAsync,
    post: exports.postAsync,
    destroy: exports.destroyAsync
  });
  asyncHook.enable();
};

exports.initAsync = function initAsync(uid) {
  var parentHandle = handleData[active] || handleDefaults;
  handleData[uid] = {
    uid: uid,
    parentUid: active,
    spanId: null,
    parentSpanId: parentHandle.spanId || parentHandle.parentSpanId,
    traceId: parentHandle.traceId,
    suppressTracing: parentHandle.suppressTracing,
    containsExitSpan: parentHandle.containsExitSpan
  };
};

exports.initAndPreSimulated = function initAndPreSimulated() {
  var uid = 'sim-' + simulatedUidCounter++;
  exports.initAsync(uid);
  exports.preAsync(uid);

  // Ensure that this does not turn into a memory leak by forcefully removing
  // simulated handles after one minute.
  setTimeout(exports.postAndDestroySimulated, 60000, uid);

  return uid;
};

exports.postAndDestroySimulated = function postAndDestroySimulated(uid) {
  if (active === uid) {
    active = null;
  }
  delete handleData[uid];
};

exports.isUidExisting = function isUidExisting(uid) {
  return uid in handleData;
};

exports.preAsync = function pre(uid) {
  active = uid;
};

exports.postAsync = function post() {
  active = null;
};

exports.destroyAsync = function destroy(uid) {
  delete handleData[uid];
};

exports.printDebugInfo = function printDebugInfo(uid) {
  /* eslint-disable no-console */
  var dataToPrint = handleData;
  if (uid != null) {
    dataToPrint = dataToPrint[uid];
    console.log('Printing debug information for UID ' + uid + ' only.');
  }
  console.log(require('util').inspect(dataToPrint, {
    depth: null,
    colors: true
  }));
  /* eslint-enable no-console */
};

exports.getCurrentUid = function getCurrentUid() {
  return active;
};

exports.getCurrentHandleData = function getCurrentHandleData() {
  return handleData[active];
};

exports.setSpanId = function setSpanId(uid, spanId) {
  handleData[uid].spanId = spanId;
};

exports.getSpanId = function getSpanId(uid) {
  return handleData[uid].spanId;
};

exports.getParentSpanId = function getParentSpanId(uid) {
  return handleData[uid].parentSpanId;
};

exports.setTraceId = function setTraceId(uid, traceId) {
  handleData[uid].traceId = traceId;
};

exports.getTraceId = function getTraceId(uid) {
  return handleData[uid].traceId;
};

exports.setTracingSuppressed = function setTracingSuppressed(uid, suppressed) {
  handleData[uid].suppressTracing = suppressed;
};

exports.isTracingSuppressed = function isTracingSuppressed(uid) {
  return handleData[uid].suppressTracing;
};

exports.markAsExitSpan = function markAsExitSpan(uid) {
  handleData[uid].containsExitSpan = true;
};

exports.containsExitSpan = function containsExitSpan(uid) {
  return handleData[uid].containsExitSpan;
};

exports.getStackTrace = function getStackTrace(referenceFunction) {
  return stackTrace.captureStackTrace(stackTraceLength, referenceFunction);
};
