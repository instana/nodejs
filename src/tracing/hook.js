'use strict';

var asyncHook = require('async-hook');

var agentOpts = require('../agent/opts');
var pidStore = require('../pidStore');

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

exports.init = function() {
  active = null;
  asyncHook.addHooks({
    init: exports.initAsync,
    pre: exports.preAsync,
    post: exports.postAsync,
    destroy: exports.destroyAsync
  });
  asyncHook.enable();
};

exports.initAsync = function init(uid) {
  var parentHandle = handleData[active] || handleDefaults;
  handleData[uid] = {
    uid: uid,
    parentUid: active,
    parentHandle: handleData[active],

    spanId: null,
    parentSpanId: parentHandle.spanId || parentHandle.parentSpanId,
    traceId: parentHandle.traceId,
    suppressTracing: parentHandle.suppressTracing,
    containsExitSpan: parentHandle.containsExitSpan
  };
};

exports.initAndPreSimulated = function() {
  var uid = 'sim-' + simulatedUidCounter++;
  exports.initAsync(uid);
  exports.preAsync(uid);

  // Ensure that this does not turn into a memory leak by forcefully removing
  // simulated handles after one minute.
  setTimeout(exports.postAndDestroySimulated, 60000, uid);

  return uid;
};

exports.postAndDestroySimulated = function(uid) {
  if (active === uid) {
    active = null;
  }
  delete handleData[uid];
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

exports.setSpanId = function setSpanId(uid, spanId) {
  handleData[uid].spanId = spanId;
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

exports.generateRandomSpanId = function generateRandomSpanId() {
  var spanId = Math.floor(
    Math.random() * (Number.MAX_SAFE_INTEGER - Number.MIN_SAFE_INTEGER) + Number.MIN_SAFE_INTEGER
  );
  return spanId.toString(16);
};

exports.getFrom = function getFrom() {
  return {
    e: String(pidStore.pid),
    h: agentOpts.agentUuid
  };
};

exports.markAsExitSpan = function markAsExitSpan(uid) {
  handleData[uid].containsExitSpan = true;
};

exports.containsExitSpan = function containsExitSpan(uid) {
  return handleData[uid].containsExitSpan;
};
