'use strict';

var logger = require('../../logger').getLogger('tracing/mongodb');
var requireHook = require('../../util/requireHook');
var transmission = require('../transmission');
var tracingUtil = require('../tracingUtil');
var hook = require('../hook');

var isActive = false;

// operation ID + request ID => {
//   span,
//   uid
// }
var requests = {};


exports.init = function() {
  requireHook.on('mongodb', instrument);
};


function instrument(mongodb) {
  if (!mongodb.instrument) {
    logger.info('Cannot instrument the MongoDB driver as it is lacking APM support.');
    return;
  }

  var listener = mongodb.instrument({
    operationIdGenerator: {
      next: function() {
        return {};
      }
    },

    timestampGenerator: {
      current: function() {
        return Date.now();
      },

      duration: function(start, end) {
        return end - start;
      }
    }
  }, function(error) {
    if (error) {
      logger.warn('Failed to instrument MongoDB', {error: error});
    }
  });

  listener.on('started', onStarted);
  listener.on('succeeded', onSucceeded);
  listener.on('failed', onFailed);
}


function onStarted(event) {
  if (!isActive) {
    return;
  }

  var uid = hook.initAndPreSimulated();
  if (hook.isTracingSuppressed(uid)) {
    return;
  }

  var traceId = event.operationId.traceId || hook.getTraceId(uid);
  var parentSpanId = event.operationId.parentSpanId || hook.getParentSpanId(uid);
  if (!traceId || !parentSpanId) {
    return;
  }

  hook.markAsExitSpan(uid);

  var host = event.connectionId.host;
  var port = event.connectionId.port;
  var database = event.databaseName;
  var collection = event.command.collection || event.command[event.commandName];
  var span = {
    s: tracingUtil.generateRandomSpanId(),
    t: traceId,
    p: parentSpanId,
    f: tracingUtil.getFrom(),
    async: false,
    error: false,
    ec: 0,
    ts: Date.now(),
    d: 0,
    n: 'mongo',
    // using the Mongodb instrumentation API, it is not possible to gather stack traces. Getting started
    // without stack traces at first.
    stack: [],
    data: {
      peer: {
        hostname: host,
        port: port
      },
      mongo: {
        command: event.commandName,
        service: host + ':' + port,
        namespace: database + '.' + collection,
        filter: event.command.filter,
        query: event.command.query
      }
    }
  };
  hook.setSpanId(uid, span.s);
  event.operationId.traceId = span.t;
  event.operationId.parentSpanId = span.p;

  requests[getUniqueRequestId(event)] = {
    uid: uid,
    span: span
  };
}


function onSucceeded(event) {
  if (!isActive) {
    cleanup(event);
    return;
  }

  var spanData = requests[getUniqueRequestId(event)];
  if (!spanData) {
    return;
  }

  spanData.span.d = Date.now() - spanData.span.ts;
  spanData.span.error = false;
  transmission.addSpan(spanData.span);
  hook.postAndDestroySimulated(spanData.uid);

  cleanup(event);
}


function onFailed(event) {
  if (!isActive) {
    cleanup(event);
    return;
  }

  var spanData = requests[getUniqueRequestId(event)];
  if (!spanData) {
    return;
  }

  spanData.span.d = Date.now() - spanData.span.ts;
  spanData.span.error = true;
  spanData.span.ec = 1;
  transmission.addSpan(spanData.span);
  hook.postAndDestroySimulated(spanData.uid);

  cleanup(event);
}


function getUniqueRequestId(event) {
  return event.operationId + '_' + event.requestId;
}


function cleanup(event) {
  var requestId = getUniqueRequestId(event);
  delete requests[requestId];
}


exports.activate = function() {
  isActive = true;
};


exports.deactivate = function() {
  isActive = false;
};
