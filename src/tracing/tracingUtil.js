'use strict';

var stackTrace = require('../util/stackTrace');
var agentOpts = require('../agent/opts');
var pidStore = require('../pidStore');

var stackTraceLength = 0;

exports.init = function(config) {
  stackTraceLength = config.tracing.stackTraceLength != null ? config.tracing.stackTraceLength : 10;
};

exports.getFrom = function getFrom() {
  return {
    e: String(pidStore.pid),
    h: agentOpts.agentUuid
  };
};

exports.getStackTrace = function getStackTrace(referenceFunction) {
  return stackTrace.captureStackTrace(stackTraceLength, referenceFunction);
};

exports.generateRandomTraceId = function generateRandomTraceId() {
  // TODO: as soon as all Instana tracers support 128bit trace IDs we can
  // turn this into generating a longer String
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
};

exports.generateRandomSpanId = function generateRandomSpanId() {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
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
